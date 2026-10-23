import type { PatientInfo } from "./patient";
import type { Sex, TextItem } from "./types";

/** Um arquivo (PDF ou imagem) enviado. Um mesmo paciente pode ter vários. */
export interface Member {
  id: string;
  fileName: string;
  items: TextItem[];
  info: PatientInfo;
  /** Motivo, quando o arquivo não pôde ser lido. */
  problem?: string;
  /** Texto obtido por reconhecimento de imagem (OCR): pode ter erros, o médico precisa conferir. */
  ocr?: boolean;
  /** Segunda leitura do OCR, para conferir a primeira. */
  altItems?: TextItem[];
}

export interface Group {
  id: string;
  members: Member[];
  name?: string;
  birth?: string;
  /** Só para vincular arquivos. Nunca exibir, exportar ou guardar. */
  cpf?: string;
  /** Sexo informado nos laudos do paciente (se concordam). */
  sex?: Sex;
  /** Laudos do mesmo paciente informam sexos diferentes: não escolhe nenhum, o médico define. */
  sexConflict?: boolean;
  examDate?: string;
  /** Como os arquivos foram reunidos (só quando há mais de um). */
  via?: "cpf" | "nome";
}

const CONNECTORS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** "JOÃO DA SILVA" e "Joao Silva" geram a mesma chave. */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !CONNECTORS.has(w))
    .join(" ");
}

/** Mesmo primeiro e último nome (aceita inicial no primeiro): "João Silva" ~ "João Pedro da Silva". */
export function namesCompatible(a: string, b: string): boolean {
  const ta = nameKey(a).split(" ").filter(Boolean);
  const tb = nameKey(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return true;
  const first = (x: string, y: string) => x === y || (x.length === 1 && y.startsWith(x)) || (y.length === 1 && x.startsWith(y));
  return first(ta[0], tb[0]) && ta[ta.length - 1] === tb[tb.length - 1];
}

const birthsCompatible = (a?: string, b?: string) => !a || !b || a === b;

/** Com o mesmo CPF, nome e nascimento só podem divergir pouco: senão pode ser erro de digitação do laboratório. */
function sameCpfCompatible(a: Member, b: Member): boolean {
  const na = a.info.name, nb = b.info.name;
  const sexOk = !a.info.sex || !b.info.sex || a.info.sex === b.info.sex;
  return (!na || !nb || namesCompatible(na, nb)) && birthsCompatible(a.info.birth, b.info.birth) && sexOk;
}

/**
 * Decide, para cada arquivo, a qual paciente ele pertence (sem a escolha manual do médico).
 *
 * 1. CPF válido igual (e nome/nascimento compatíveis): mesmo paciente, mesmo que o nome venha escrito diferente.
 * 2. Sem CPF: nome E data de nascimento iguais. Se esse nome+nascimento já pertence a UM paciente com CPF, entra
 *    nele; se pertencer a mais de um, fica sozinho (ambíguo) e o médico decide.
 * CPFs diferentes nunca são unidos: são pessoas diferentes.
 */
function autoIds(members: Member[]): Map<string, string> {
  const out = new Map<string, string>();
  interface G { id: string; members: Member[] }
  const cpfGroups = new Map<string, G[]>();
  const withCpf: G[] = [];

  for (const m of members) {
    if (m.problem) out.set(m.id, `g:${m.id}`);
    else if (m.info.cpf) {
      const list = cpfGroups.get(m.info.cpf) ?? [];
      cpfGroups.set(m.info.cpf, list);
      let g = list.find((x) => x.members.some((o) => sameCpfCompatible(o, m)));
      if (!g) {
        g = { id: `g:${m.id}`, members: [] };
        list.push(g);
        withCpf.push(g);
      }
      g.members.push(m);
      out.set(m.id, g.id);
    }
  }

  const byKey = new Map<string, string>();
  for (const m of members) {
    if (m.problem || m.info.cpf) continue;
    const key = m.info.name ? nameKey(m.info.name) : "";
    const birth = m.info.birth;
    if (!key || !birth) {
      out.set(m.id, `g:${m.id}`);
      continue;
    }
    const cands = withCpf.filter((g) => g.members.some((o) => o.info.name && nameKey(o.info.name) === key && o.info.birth === birth));
    if (cands.length === 1) out.set(m.id, cands[0].id);
    else if (cands.length > 1) out.set(m.id, `g:${m.id}`); // ambíguo: não escolhe sozinho
    else {
      const k = `${key}|${birth}`;
      if (!byKey.has(k)) byKey.set(k, `g:${m.id}`);
      out.set(m.id, byKey.get(k)!);
    }
  }
  return out;
}

/** `manual` leva o arquivo (id) para o grupo escolhido pelo médico, sobrepondo a regra automática. */
export function buildGroups(members: Member[], manual: Record<string, string>): Group[] {
  const auto = autoIds(members);
  const map = new Map<string, Group>();
  for (const m of members) {
    const gid = manual[m.id] ?? auto.get(m.id)!;
    let g = map.get(gid);
    if (!g) map.set(gid, (g = { id: gid, members: [] }));
    g.members.push(m);
  }
  return [...map.values()].map((g) => {
    const cpf = g.members.find((m) => m.info.cpf)?.info.cpf;
    const viaCpf = !!cpf && g.members.filter((m) => m.info.cpf === cpf).length >= 2;
    const sexes = new Set(g.members.map((m) => m.info.sex).filter((x): x is Sex => !!x));
    return {
      ...g,
      name: g.members.find((m) => m.info.name)?.info.name,
      birth: g.members.find((m) => m.info.birth)?.info.birth,
      cpf,
      sex: sexes.size === 1 ? [...sexes][0] : undefined,
      sexConflict: sexes.size > 1,
      examDate: g.members.find((m) => m.info.examDate)?.info.examDate,
      via: g.members.length > 1 ? (viaCpf ? ("cpf" as const) : ("nome" as const)) : undefined,
    };
  });
}

export type SuggestionReason = "name" | "cpf" | "ambiguous";

export interface Suggestion {
  key: string;
  a: Group;
  b: Group;
  reason: SuggestionReason;
}

const pairKey = (a: Group, b: Group) => [a.id, b.id].sort().join("||");

/**
 * Casos em que o médico precisa decidir:
 * - "name": mesmo nome (ignorando acentos e "da/de") e pelo menos um lado sem data de nascimento.
 * - "cpf": mesmo CPF, mas nome ou nascimento diferentes (pode ser digitação do laboratório).
 * - "ambiguous": laudo sem CPF que combina com mais de um paciente de mesmo nome e nascimento.
 * CPFs diferentes nunca geram sugestão (são pessoas diferentes), nem nascimentos diferentes (homônimos).
 */
export function findSuggestions(groups: Group[], dismissed: ReadonlySet<string>): Suggestion[] {
  const cands = groups.filter((g) => !g.id.startsWith("solo:") && g.members.some((m) => !m.problem));
  const out: Suggestion[] = [];
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const [a, b] = [cands[i], cands[j]];
      let reason: SuggestionReason | null = null;
      if (a.cpf && b.cpf) {
        if (a.cpf === b.cpf) reason = "cpf";
      } else if (a.name && b.name && nameKey(a.name) === nameKey(b.name)) {
        if (!a.birth || !b.birth) reason = "name";
        else if (a.birth === b.birth) reason = "ambiguous";
      }
      if (!reason) continue;
      const key = pairKey(a, b);
      if (!dismissed.has(key)) out.push({ key, a, b, reason });
    }
  }
  return out;
}

/** Une o grupo `b` ao `a`. */
export function mergeGroups(manual: Record<string, string>, a: Group, b: Group): Record<string, string> {
  const next = { ...manual };
  for (const m of b.members) next[m.id] = a.id;
  return next;
}

/** Tira um arquivo do grupo, tornando-o um paciente à parte. */
export function separateMember(manual: Record<string, string>, memberId: string): Record<string, string> {
  return { ...manual, [memberId]: `solo:${memberId}` };
}
