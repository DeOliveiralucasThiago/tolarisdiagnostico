/** Trecho de texto do PDF com posição (origem no canto inferior esquerdo, como no PDF). */
export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  page: number;
}

export type Status = "green" | "orange" | "red" | "unknown";

/**
 * Faixas configuradas pelo médico para um exame.
 * - `attentionFrom` / `alertFrom`: valor >= limite.
 * - `attentionBelow` / `alertBelow`: valor < limite (para exames em que valor baixo também preocupa).
 */
export interface Rule {
  attentionFrom?: number;
  alertFrom?: number;
  attentionBelow?: number;
  alertBelow?: number;
}

export interface ExamDefinition {
  id: string;
  name: string;
  unit: string;
  /** Nomes alternativos usados pelos laboratórios (sem necessidade de acentos/caixa). */
  aliases: string[];
  /** Palavras que, perto do nome, indicam que a linha é de outro exame (ex.: "clearance de creatinina"). */
  exclude?: string[];
}

export interface ExtractedResult {
  examId: string;
  /** Valor numérico lido. */
  value: number;
  /** Texto original do resultado, como aparece no PDF. */
  raw: string;
  /** "<" ou ">" quando o laudo traz "< 0,5", por exemplo. */
  qualifier?: "<" | ">";
  unit?: string;
  /** Faixa de referência impressa pelo laboratório, quando encontrada na mesma linha. */
  labReference?: string;
  /** Linha do PDF de onde o valor veio, para o médico conferir. */
  /** `file` só aparece quando o paciente tem mais de um arquivo. */
  source: { page: number; text: string; file?: string };
}

export interface ExtractionOutput {
  results: ExtractedResult[];
  /** Exames pedidos que não foram localizados no PDF. */
  notFound: string[];
}
