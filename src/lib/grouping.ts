import type { PatientInfo } from "./patient";
import type { TextItem } from "./types";

/** Um arquivo (PDF) enviado. Um mesmo paciente pode ter vários. */
export interface Member {
  id: string;
  fileName: string;
  items: TextItem[];
  info: PatientInfo;
  /** Motivo, quando o PDF não pôde ser lido. */
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

/**
 * União automática SÓ com nome E data de nascimento iguais. Sem data de nascimento, nunca une sozinho:
 * juntar duas pessoas diferentes por engano é pior do que deixá-las separadas.
 */
export function autoGroupId(m: Member): string {
  const key = m.info.name ? nameKey(m.info.name) : "";
  return !m.problem && key && m.info.birth ? `auto:${key}|${m.info.birth}` : `file:${m.id}`;
}

/** `manual` leva o arquivo (id) para o grupo escolhido pelo médico, sobrepondo a regra automática. */
export function buildGroups(members: Member[], manual: Record<string, string>): Group[] {
  const map = new Map<string, Group>();
  for (const m of members) {
    const gid = manual[m.id] ?? autoGroupId(m);
    let g = map.get(gid);
    if (!g) map.set(gid, (g = { id: gid, members: [] }));
    g.members.push(m);
  }
  return [...map.values()].map((g) => ({
    ...g,
    name: g.members.find((m) => m.info.name)?.info.name,
    birth: g.members.find((m) => m.info.birth)?.info.birth,
  }));
}

export interface Suggestion {
  key: string;
  a: Group;
  b: Group;
}

const pairKey = (a: Group, b: Group) => [a.id, b.id].sort().join("||");

/**
 * "Possível mesmo paciente": mesmo nome (ignorando acentos e "da/de") e pelo menos um dos lados sem data de
 * nascimento. Datas diferentes indicam homônimos: nunca sugere.
 */
export function findSuggestions(groups: Group[], dismissed: ReadonlySet<string>): Suggestion[] {
  const cands = groups.filter((g) => !g.id.startsWith("solo:") && g.name && g.members.some((m) => !m.problem));
  const out: Suggestion[] = [];
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const [a, b] = [cands[i], cands[j]];
      if (nameKey(a.name!) !== nameKey(b.name!) || (a.birth && b.birth)) continue;
      const key = pairKey(a, b);
      if (!dismissed.has(key)) out.push({ key, a, b });
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
