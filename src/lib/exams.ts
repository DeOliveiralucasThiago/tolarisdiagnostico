import type { ExamDefinition } from "./types";

/**
 * Catálogo de exames reconhecidos. Cada laboratório escreve o nome de um jeito,
 * por isso a busca é feita por esta lista de sinônimos, e não pela posição no PDF.
 */
export const EXAMS: ExamDefinition[] = [
  { id: "glicose", name: "Glicose (jejum)", unit: "mg/dL", aliases: ["glicose", "glicemia", "glicemia de jejum", "glicose em jejum", "glicose jejum", "glicemia jejum"], exclude: ["media", "pos", "apos", "urina", "liquor", "tolerancia"] },
  { id: "hba1c", name: "Hemoglobina glicada", unit: "%", aliases: ["hemoglobina glicada", "hemoglobina glicosilada", "hemoglobina a1c", "hba1c", "hb a1c"] },
  { id: "colesterol_total", name: "Colesterol total", unit: "mg/dL", aliases: ["colesterol total"] },
  { id: "hdl", name: "Colesterol HDL", unit: "mg/dL", aliases: ["colesterol hdl", "hdl colesterol", "hdl", "hdl-colesterol"] },
  { id: "ldl", name: "Colesterol LDL", unit: "mg/dL", aliases: ["colesterol ldl", "ldl colesterol", "ldl", "ldl-colesterol"] },
  { id: "triglicerides", name: "Triglicerídeos", unit: "mg/dL", aliases: ["triglicerides", "triglicerideos", "triglicérides", "triglicerídeos"] },
  { id: "tgo", name: "TGO (AST)", unit: "U/L", aliases: ["tgo", "ast", "tgo/ast", "ast/tgo", "transaminase oxalacetica", "aspartato aminotransferase"] },
  { id: "tgp", name: "TGP (ALT)", unit: "U/L", aliases: ["tgp", "alt", "tgp/alt", "alt/tgp", "transaminase piruvica", "alanina aminotransferase"] },
  { id: "gama_gt", name: "Gama GT", unit: "U/L", aliases: ["gama gt", "gama-gt", "gama glutamil transferase", "gama glutamiltransferase", "ggt"] },
  { id: "creatinina", name: "Creatinina", unit: "mg/dL", aliases: ["creatinina", "creatinina serica"], exclude: ["clearance", "depuracao", "relacao", "razao", "urina"] },
  { id: "ureia", name: "Ureia", unit: "mg/dL", aliases: ["ureia", "ureia serica"], exclude: ["relacao", "razao", "urina"] },
  { id: "acido_urico", name: "Ácido úrico", unit: "mg/dL", aliases: ["acido urico"] },
  { id: "hemoglobina", name: "Hemoglobina", unit: "g/dL", aliases: ["hemoglobina", "hb"], exclude: ["corpuscular", "media", "concentracao", "glicada", "glicosilada"] },
  { id: "hematocrito", name: "Hematócrito", unit: "%", aliases: ["hematocrito", "ht"] },
  { id: "leucocitos", name: "Leucócitos", unit: "/mm³", aliases: ["leucocitos", "leucocitos totais", "global de leucocitos"] },
  { id: "plaquetas", name: "Plaquetas", unit: "/mm³", aliases: ["plaquetas", "contagem de plaquetas"] },
  { id: "sodio", name: "Sódio", unit: "mEq/L", aliases: ["sodio", "sodio serico"], exclude: ["urina"] },
  { id: "potassio", name: "Potássio", unit: "mEq/L", aliases: ["potassio", "potassio serico"], exclude: ["urina"] },
  { id: "ferritina", name: "Ferritina", unit: "ng/mL", aliases: ["ferritina", "ferritina serica"] },
  { id: "vitamina_d", name: "Vitamina D (25-OH)", unit: "ng/mL", aliases: ["25-hidroxivitamina d", "25 hidroxivitamina d", "vitamina d", "25-oh vitamina d", "vitamina d 25-hidroxi"] },
  { id: "vitamina_b12", name: "Vitamina B12", unit: "pg/mL", aliases: ["vitamina b12", "cobalamina"] },
  { id: "t4_livre", name: "T4 livre", unit: "ng/dL", aliases: ["t4 livre", "tiroxina livre"] },
  { id: "testosterona_total", name: "Testosterona total", unit: "ng/dL", aliases: ["testosterona total"] },
  { id: "prolactina", name: "Prolactina", unit: "ng/mL", aliases: ["prolactina"] },
  { id: "tsh", name: "TSH", unit: "µUI/mL", aliases: ["tsh", "hormonio tireoestimulante"] },
];

export const EXAMS_BY_ID = new Map(EXAMS.map((e) => [e.id, e]));

/** Remove acentos, caixa e pontuação nas bordas, para comparar nomes entre laboratórios. */
export function normalizeToken(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^[^a-z0-9<>]+|[^a-z0-9%]+$/g, "");
}

export function tokenize(s: string): string[] {
  return s.split(/\s+/).map(normalizeToken).filter(Boolean);
}
