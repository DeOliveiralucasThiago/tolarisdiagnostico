import { EXAMS, normalizeToken, tokenize } from "./exams";
import { parseNumberBR } from "./numbers";
import type { ExamDefinition, ExtractedResult, ExtractionOutput, TextItem } from "./types";

interface Tok {
  raw: string;
  norm: string;
  x: number;
}

interface Row {
  page: number;
  y: number;
  tokens: Tok[];
  text: string;
}

const ROW_TOLERANCE = 3;
const MAX_LABEL_OFFSET = 3; // o nome do exame deve estar no começo da linha
const LOOKAHEAD_ROWS = 3;
// Referências por população (crianças, homem/mulher...) são ambíguas: melhor omitir do que mostrar a errada.
const AMBIGUOUS_REFERENCE = /(crian|recem|gestant|adulto|homem|mulher|masculin|feminin|desej|deficien|ideal|idade|meses|anos|:\s*$)/i;


const STOP_WORDS = (n: string) =>
  n.startsWith("refer") || ["vr", "ref", "metodo", "material", "intervalo", "valores", "amostra"].includes(n);

/** Depois destas palavras, o resto da linha é faixa de referência, não resultado. */
const REFERENCE_WORDS = new Set([
  "desejavel", "otimo", "ideal", "normal", "ate", "inferior", "superior", "maior", "menor",
  "acima", "abaixo", "adulto", "adultos", "homens", "mulheres", "masculino", "feminino",
  "criancas", "limite", "borderline",
]);

const isRangeJoiner = (t?: Tok) => !!t && (t.norm === "a" || t.norm === "ate" || /^[-–—]$/.test(t.raw));

const UNIT_RE =
  /^(?:%|(?:[mnµup]?g|[mnµu]?ui|micro?ui|u|mil|milh(?:ões|oes)|mmol|meq|fl|pg|seg)(?:\/[a-zµ³0-9]+)?|\/(?:mm³|mm3|µl|ul)|mm³|mm3)$/i;

export function buildRows(items: TextItem[]): Row[] {
  const sorted = [...items]
    .filter((i) => i.str.trim() !== "")
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

  const groups: TextItem[][] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && last[0].page === item.page && Math.abs(last[0].y - item.y) <= ROW_TOLERANCE) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }

  return groups.map((g) => {
    g.sort((a, b) => a.x - b.x);
    const tokens: Tok[] = [];
    for (const item of g) {
      const parts = item.str.split(/\s+/).filter(Boolean);
      const len = Math.max(item.str.length, 1);
      let offset = 0;
      for (const part of parts) {
        const at = item.str.indexOf(part, offset);
        offset = at + part.length;
        tokens.push({ raw: part, norm: normalizeToken(part), x: item.x + (item.width * at) / len });
      }
    }
    return { page: g[0].page, y: g[0].y, tokens, text: tokens.map((t) => t.raw).join(" ") };
  });
}

interface Alias {
  def: ExamDefinition;
  tokens: string[];
}

function buildAliases(defs: ExamDefinition[]): Alias[] {
  return defs
    .flatMap((def) => def.aliases.map((a) => ({ def, tokens: tokenize(a) })))
    .filter((a) => a.tokens.length > 0)
    .sort((a, b) => b.tokens.length - a.tokens.length || b.tokens.join("").length - a.tokens.join("").length);
}

interface LabelMatch {
  def: ExamDefinition;
  end: number; // índice do primeiro token depois do nome
}

function matchLabel(row: Row, aliases: Alias[]): LabelMatch | null {
  const norms = row.tokens.map((t) => t.norm);
  let best: { alias: Alias; start: number } | null = null;

  for (const alias of aliases) {
    for (let start = 0; start <= Math.min(MAX_LABEL_OFFSET, norms.length - alias.tokens.length); start++) {
      if (!alias.tokens.every((t, k) => norms[start + k] === t)) continue;
      if (alias.def.exclude?.length) {
        const around = [...norms.slice(Math.max(0, start - 3), start), ...norms.slice(start + alias.tokens.length, start + alias.tokens.length + 2)];
        if (around.some((n) => alias.def.exclude!.includes(n))) continue;
      }
      if (!best || alias.tokens.length > best.alias.tokens.length) best = { alias, start };
      break;
    }
  }
  return best ? { def: best.alias.def, end: best.start + best.alias.tokens.length } : null;
}

interface Candidate {
  value: number;
  raw: string;
  qualifier?: "<" | ">";
  unit?: string;
  x: number;
}

interface Scan {
  candidates: Candidate[];
  reference: string[];
}

function cleanNumber(raw: string): string {
  return raw.replace(/[^\d]+$/, "");
}

function isNumeric(raw: string): boolean {
  return parseNumberBR(cleanNumber(raw)) != null;
}

/** Lê um número (com "<"/">" opcional) a partir do token i. */
function readNumber(tokens: Tok[], i: number): { value: number; raw: string; qualifier?: "<" | ">"; x: number; used: number } | null {
  const t = tokens[i];
  let qualifier: "<" | ">" | undefined;
  let numRaw = t.raw;
  let numTok = t;
  let used = 1;
  const op = /^([<>])=?(.*)$/.exec(t.raw);
  if (op) {
    qualifier = op[1] as "<" | ">";
    if (op[2]) {
      numRaw = op[2];
    } else if (tokens[i + 1]) {
      numRaw = tokens[i + 1].raw;
      numTok = tokens[i + 1];
      used = 2;
    }
  }
  const value = parseNumberBR(cleanNumber(numRaw));
  if (value == null) return null;
  return { value, raw: qualifier ? `${qualifier} ${cleanNumber(numRaw)}` : cleanNumber(numRaw), qualifier, x: numTok.x, used };
}

function unitAt(tokens: Tok[], i: number): string | undefined {
  const next = tokens[i];
  const clean = next?.raw.replace(/[.,;]+$/, "");
  return clean && UNIT_RE.test(clean) ? clean : undefined;
}

/** Percorre os tokens após o nome do exame separando candidatos a resultado da faixa de referência. */
function scan(tokens: Tok[], from: number): Scan {
  const out: Scan = { candidates: [], reference: [] };
  // Depois de "inferior a", "até", "desejável:" etc., o próximo número é referência, não resultado.
  let referencePending = false;

  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i];
    if (!/[a-z0-9<>%]/i.test(t.raw)) continue; // linhas pontilhadas "......."
    if (STOP_WORDS(t.norm)) break;

    if (REFERENCE_WORDS.has(t.norm)) {
      referencePending = true;
      out.reference.push(t.raw);
      continue;
    }

    // faixa "70 a 99", "70 - 99", "70-99"
    if (/^(\d+(?:[.,]\d+)?)[-–](\d+(?:[.,]\d+)?)$/.test(t.raw)) {
      out.reference.push(t.raw);
      referencePending = false;
      continue;
    }
    if (isNumeric(t.raw) && isRangeJoiner(tokens[i + 1]) && tokens[i + 2] && isNumeric(tokens[i + 2].raw)) {
      out.reference.push(t.raw, tokens[i + 1].raw, tokens[i + 2].raw);
      i += 2;
      const u = unitAt(tokens, i + 1);
      if (u) {
        out.reference.push(u);
        i += 1;
      }
      referencePending = false;
      continue;
    }

    const num = readNumber(tokens, i);
    if (referencePending) {
      out.reference.push(t.raw);
      if (num) {
        if (num.used === 2) out.reference.push(tokens[i + 1].raw);
        i += num.used - 1;
        const u = unitAt(tokens, i + 1);
        if (u) {
          out.reference.push(u);
          i += 1;
        }
        referencePending = false;
      }
      continue;
    }

    if (num) {
      i += num.used - 1;
      const unit = unitAt(tokens, i + 1);
      if (unit) i += 1;
      out.candidates.push({ value: num.value, raw: num.raw, qualifier: num.qualifier, unit, x: num.x });
    }
  }
  return out;
}

function pickCandidate(s: Scan, resultColumnX: number | undefined): Candidate | undefined {
  let list = s.candidates;
  if (list.length > 1) {
    const plain = list.filter((c) => !c.qualifier);
    if (plain.length) list = plain;
  }
  if (list.length > 1 && resultColumnX != null) {
    return [...list].sort((a, b) => Math.abs(a.x - resultColumnX) - Math.abs(b.x - resultColumnX))[0];
  }
  return list[0];
}

interface Header {
  page: number;
  y: number;
  x: number;
}

function findHeaders(rows: Row[]): Header[] {
  const headers: Header[] = [];
  for (const row of rows) {
    const tok = row.tokens.find((t) => t.norm.startsWith("resultado"));
    if (tok && row.tokens.length >= 2 && !row.tokens.some((t) => isNumeric(t.raw))) {
      headers.push({ page: row.page, y: row.y, x: tok.x });
    }
  }
  return headers;
}

function headerFor(row: Row, headers: Header[]): number | undefined {
  const above = headers
    .filter((h) => h.page === row.page && h.y > row.y)
    .sort((a, b) => a.y - row.y - (b.y - row.y));
  return above[0]?.x;
}

/**
 * Localiza cada exame pelo nome (e sinônimos), independentemente da posição ou ordem no laudo.
 * `examIds` restringe a busca aos exames configurados pelo médico; sem ele, procura todos do catálogo.
 */
export function extractResults(items: TextItem[], examIds?: string[]): ExtractionOutput {
  const defs = examIds ? EXAMS.filter((e) => examIds.includes(e.id)) : EXAMS;
  const aliases = buildAliases(defs);
  const rows = buildRows(items);
  const headers = findHeaders(rows);
  const found = new Map<string, ExtractedResult>();

  rows.forEach((row, index) => {
    const label = matchLabel(row, aliases);
    if (!label || found.has(label.def.id)) return;

    let sc = scan(row.tokens, label.end);
    let sourceRows = [row];

    // layout em várias linhas: nome numa linha, "Resultado: 92 mg/dL" nas seguintes
    if (sc.candidates.length === 0) {
      for (let k = 1; k <= LOOKAHEAD_ROWS; k++) {
        const next = rows[index + k];
        if (!next || next.page !== row.page || matchLabel(next, aliases)) break;
        const nextScan = scan(next.tokens, 0);
        if (nextScan.candidates.length) {
          sc = { candidates: nextScan.candidates, reference: sc.reference.length ? sc.reference : nextScan.reference };
          sourceRows = [row, next];
          break;
        }
      }
    }

    const chosen = pickCandidate(sc, headerFor(sourceRows[sourceRows.length - 1], headers));
    if (!chosen) return;

    // faixa do laboratório em linhas próprias logo abaixo: "Valor de referência: ...", "VR : ..."
    let labReference = sc.reference.length ? sc.reference.join(" ") : undefined;
    if (!labReference) {
      const last = rows.indexOf(sourceRows[sourceRows.length - 1]);
      for (let k = 1; k <= LOOKAHEAD_ROWS; k++) {
        const next = rows[last + k];
        if (!next || next.page !== row.page || matchLabel(next, aliases)) break;
        const first = next.tokens[0]?.norm;
        if (first === "vr" || first === "valor" || first === "valores" || first?.startsWith("refer")) {
          const text = next.text.replace(/^(valores?\s+de\s+refer[eê]ncia|valor\s+de|valores?|vr|refer[eê]ncia)\s*:?\s*/i, "").slice(0, 90);
          labReference = text;
          break;
        }
      }
    }

    if (labReference && AMBIGUOUS_REFERENCE.test(labReference.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) labReference = undefined;

    found.set(label.def.id, {
      examId: label.def.id,
      value: chosen.value,
      raw: chosen.raw,
      qualifier: chosen.qualifier,
      unit: chosen.unit,
      labReference,
      source: { page: row.page, text: sourceRows.map((r) => r.text).join(" ⏎ ") },
    });
  });

  return {
    results: defs.filter((d) => found.has(d.id)).map((d) => found.get(d.id)!),
    notFound: defs.filter((d) => !found.has(d.id)).map((d) => d.id),
  };
}
