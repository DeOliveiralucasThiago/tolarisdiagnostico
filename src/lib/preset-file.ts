import { EXAMS } from "./exams";
import type { Preset } from "./presets";
import type { ExamDefinition, Rule, RuleVariant, Thresholds } from "./types";

/**
 * Arquivo de backup/compartilhamento de critérios. Contém só presets e os exames personalizados que eles
 * usam, nunca dados de pacientes.
 */
export interface PresetFile {
  app: "tolaris-diagnostico";
  kind: "presets";
  version: 1;
  exportedAt: string;
  presets: { name: string; rules: Record<string, Rule> }[];
  customExams: ExamDefinition[];
}

const MAX_BYTES = 1_000_000;
const MAX_PRESETS = 50;
const MAX_EXAMS = 200;
const RULE_KEYS: (keyof Thresholds)[] = ["attentionFrom", "alertFrom", "attentionBelow", "alertBelow"];
const MAX_VARIANTS = 12;
const BUILTIN = new Set(EXAMS.map((e) => e.id));
const isCustomId = (id: string) => /^custom_[A-Za-z0-9_-]{1,64}$/.test(id);

export function buildPresetFile(presets: Preset[], catalog: ExamDefinition[]): PresetFile {
  const used = new Set(presets.flatMap((p) => Object.keys(p.rules)));
  return {
    app: "tolaris-diagnostico",
    kind: "presets",
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: presets.map((p) => ({ name: p.name, rules: p.rules })),
    customExams: catalog.filter((e) => !BUILTIN.has(e.id) && used.has(e.id)),
  };
}

export function presetFileName(presets: Preset[]): string {
  const base = presets.length === 1 ? presets[0].name : "todos-os-presets";
  const slug = base.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `tolaris-preset-${slug || "criterios"}.json`;
}

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max ? v.trim() : null;

function cleanThresholds(v: Record<string, unknown>): Thresholds | null {
  const out: Thresholds = {};
  for (const k of RULE_KEYS) {
    const n = v[k];
    if (n === undefined || n === null) continue;
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
    out[k] = n;
  }
  return out;
}

const age = (n: unknown): number | null | undefined =>
  n === undefined || n === null ? undefined : typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 130 ? n : null;

function cleanRule(v: unknown): Rule | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const base = cleanThresholds(o);
  if (!base) return null;
  const rule: Rule = { ...base };
  if (o.variants !== undefined && o.variants !== null) {
    if (!Array.isArray(o.variants) || o.variants.length > MAX_VARIANTS) return null;
    const variants: RuleVariant[] = [];
    for (const raw of o.variants as unknown[]) {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
      const r = raw as Record<string, unknown>;
      const t = cleanThresholds(r);
      const min = age(r.ageMin), max = age(r.ageMax);
      if (!t || min === null || max === null) return null;
      if (r.sex !== undefined && r.sex !== null && r.sex !== "M" && r.sex !== "F") return null;
      const variant: RuleVariant = { ...t };
      if (r.sex === "M" || r.sex === "F") variant.sex = r.sex;
      if (min !== undefined) variant.ageMin = min;
      if (max !== undefined) variant.ageMax = max;
      variants.push(variant);
    }
    if (variants.length) rule.variants = variants;
  }
  return rule;
}

export type ParseResult = { ok: true; file: PresetFile } | { ok: false; error: string };

/** Valida rigorosamente um arquivo vindo do usuário: nada é aceito sem passar por aqui. */
export function parsePresetFile(text: string): ParseResult {
  if (text.length > MAX_BYTES) return { ok: false, error: "O arquivo é grande demais para ser um preset." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Este arquivo não é um preset válido (não foi possível ler o conteúdo)." };
  }
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || o.app !== "tolaris-diagnostico" || o.kind !== "presets") {
    return { ok: false, error: "Este arquivo não foi gerado pelo Tolaris Diagnóstico." };
  }
  if (o.version !== 1) return { ok: false, error: "Versão do arquivo não suportada. Atualize o aplicativo e tente de novo." };
  if (!Array.isArray(o.presets) || o.presets.length === 0 || o.presets.length > MAX_PRESETS) {
    return { ok: false, error: "O arquivo não contém presets (ou contém presets demais)." };
  }

  const customExams: ExamDefinition[] = [];
  const rawExams = Array.isArray(o.customExams) ? o.customExams : [];
  if (rawExams.length > MAX_EXAMS) return { ok: false, error: "Exames personalizados demais no arquivo." };
  for (const e of rawExams as Record<string, unknown>[]) {
    const id = str(e?.id, 80);
    const name = str(e?.name, 80);
    const aliases = Array.isArray(e?.aliases) ? (e.aliases as unknown[]).map((a) => str(a, 80)).filter((a): a is string => !!a).slice(0, 20) : [];
    if (!id || !isCustomId(id) || !name || aliases.length === 0) return { ok: false, error: "Há um exame personalizado inválido no arquivo." };
    customExams.push({ id, name, unit: typeof e.unit === "string" ? e.unit.slice(0, 20) : "", aliases });
  }

  const presets: PresetFile["presets"] = [];
  for (const p of o.presets as Record<string, unknown>[]) {
    const name = str(p?.name, 120);
    const rawRules = p?.rules;
    if (!name || typeof rawRules !== "object" || rawRules === null || Array.isArray(rawRules)) {
      return { ok: false, error: "Há um preset inválido no arquivo." };
    }
    const rules: Record<string, Rule> = Object.create(null);
    for (const [id, r] of Object.entries(rawRules)) {
      if (id === "__proto__" || id === "constructor" || id === "prototype") continue;
      const rule = cleanRule(r);
      if (!rule) return { ok: false, error: `O preset “${name}” tem faixas inválidas.` };
      rules[id] = rule;
    }
    presets.push({ name, rules: { ...rules } });
  }
  return { ok: true, file: { app: "tolaris-diagnostico", kind: "presets", version: 1, exportedAt: String(o.exportedAt ?? ""), presets, customExams } };
}

export interface ImportReport {
  presets: number;
  addedExams: number;
  /** Faixas de exames que este sistema não conhece (ficaram de fora). */
  skippedRules: number;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const sameExam = (a: ExamDefinition, b: ExamDefinition) =>
  norm(a.name) === norm(b.name) && [...a.aliases].map(norm).sort().join("|") === [...b.aliases].map(norm).sort().join("|");

/**
 * Junta o arquivo ao que já existe. Nunca sobrescreve: os presets entram como novos (com id novo) e os
 * exames personalizados já existentes são reaproveitados em vez de duplicados.
 */
export function mergeImport(
  file: PresetFile,
  existing: { presets: Preset[]; customExams: ExamDefinition[] },
  makeId: () => string,
): { presets: Preset[]; customExams: ExamDefinition[]; importedIds: string[]; report: ImportReport } {
  const customExams = [...existing.customExams];
  const idMap = new Map<string, string>();
  let addedExams = 0;

  for (const incoming of file.customExams) {
    const match = customExams.find((e) => sameExam(e, incoming));
    if (match) {
      idMap.set(incoming.id, match.id);
    } else {
      const id = customExams.some((e) => e.id === incoming.id) ? `custom_${makeId().replace(/-/g, "").slice(0, 12)}` : incoming.id;
      customExams.push({ ...incoming, id });
      idMap.set(incoming.id, id);
      addedExams++;
    }
  }

  let skippedRules = 0;
  const taken = new Set(existing.presets.map((p) => p.name));
  const added: Preset[] = file.presets.map((p) => {
    const rules: Record<string, Rule> = {};
    for (const [id, rule] of Object.entries(p.rules)) {
      const target = BUILTIN.has(id) ? id : idMap.get(id);
      if (target) rules[target] = rule;
      else skippedRules++;
    }
    let name = p.name;
    if (taken.has(name)) name = `${p.name} (importado)`;
    for (let n = 2; taken.has(name); n++) name = `${p.name} (importado ${n})`;
    taken.add(name);
    return { id: makeId(), name, rules };
  });

  return {
    presets: [...existing.presets, ...added],
    customExams,
    importedIds: added.map((p) => p.id),
    report: { presets: added.length, addedExams, skippedRules },
  };
}
