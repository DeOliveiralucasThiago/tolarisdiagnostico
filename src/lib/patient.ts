import { extractCpf } from "./cpf";
import { buildRows } from "./extract";
import type { TextItem } from "./types";

export interface PatientInfo {
  name?: string;
  /** dd/mm/aaaa, como no laudo */
  birth?: string;
  /** 11 dígitos, só se válido. Serve apenas para vincular arquivos do mesmo paciente (nunca é exibido). */
  cpf?: string;
}

const HEADER_ROWS = 45;

// Campos que costumam vir logo depois do nome na mesma linha do cabeçalho.
const STOP = "(?:dn|d\\.n\\.|data|dt\\.?|nasc\\w*|cpf|rg|sexo|idade|conv[eê]nio|requisi[cç][aã]o|prontu[aá]rio|c[oó]digo|ficha|unidade|m[eé]dico|solicitante|crm)";
// "NOME MÉDICO:" e "NOME SOCIAL:" não casam, pois exigimos ":" logo após "nome".
const NAME_RE = new RegExp(`(?:^|\\s)(?:paciente|cliente|nome\\s+do\\s+paciente|nome)\\s*:\\s*(.+?)(?=\\s+${STOP}\\b|$)`, "i");
const BIRTH_RE = /(?:\bdn|d\.n\.|data\s+de\s+nasc\w*|nasc\w*)\.?\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i;
const VALID_NAME = /^[A-Za-zÀ-ÿ'.\- ]{3,80}$/;

/** Lê nome e data de nascimento do cabeçalho do laudo (primeira página). */
export function parsePatient(items: TextItem[]): PatientInfo {
  const rows = buildRows(items.filter((i) => i.page === 1)).slice(0, HEADER_ROWS);
  const info: PatientInfo = {};
  for (const row of rows) {
    if (!info.name) {
      const m = NAME_RE.exec(row.text);
      const candidate = m?.[1].trim();
      if (candidate && VALID_NAME.test(candidate)) info.name = candidate;
    }
    if (!info.birth) {
      const b = BIRTH_RE.exec(row.text);
      if (b) info.birth = b[1];
    }
    if (!info.cpf) info.cpf = extractCpf(row.text);
    if (info.name && info.birth && info.cpf) break;
  }
  return info;
}

const CONNECTORS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** "JOÃO DA SILVA" -> "João da Silva" */
export function formatName(name: string): string {
  return name
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((w, i) => (i > 0 && CONNECTORS.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1)))
    .join(" ");
}

export function ageFrom(birth: string, today: Date = new Date()): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(birth);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}
