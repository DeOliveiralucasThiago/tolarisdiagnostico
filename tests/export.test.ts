import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis";
import { buildBatchCsv, buildSummaryText, csvFileName, safeText, type ExportPatient } from "@/lib/export";
import { EXAMS } from "@/lib/exams";
import { DEFAULT_PRESET } from "@/lib/presets";
import type { TextItem } from "@/lib/types";

const mk = (str: string, y: number, x = 50): TextItem => ({ str, x, y, width: 60, page: 1 });
const lab = (glicose: string, hdl: string): TextItem[] => [
  mk("Glicose", 700), mk(glicose, 700, 200), mk("mg/dL", 700, 260),
  mk("Colesterol HDL", 680), mk(hdl, 680, 200), mk("mg/dL", 680, 260),
];
const rules = { glicose: DEFAULT_PRESET.rules.glicose, hdl: DEFAULT_PRESET.rules.hdl };
const exams = EXAMS.filter((e) => e.id === "glicose" || e.id === "hdl");
const pac = (label: string, g: string, h: string, extra: Partial<ExportPatient> = {}): ExportPatient => ({
  label, fileName: `${label}.pdf`, analysis: analyze(lab(g, h), rules, EXAMS), ...extra,
});

describe("planilha CSV do lote", () => {
  const csv = buildBatchCsv([pac("Maria Souza", "131,5", "36", { birth: "03/11/1990", age: 35 }), pac("João da Silva", "88", "52")], exams);
  const lines = csv.replace("﻿", "").trim().split("\r\n");

  it("começa com BOM e usa ';' (abre certo no Excel em português)", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0].split(";")).toHaveLength(16);
  });
  it("cabeçalho com valor e situação de cada exame do preset", () => {
    expect(lines[0]).toContain("Glicose (jejum) (mg/dL);Glicose (jejum) - situação;Colesterol HDL (mg/dL);Colesterol HDL - situação");
  });
  it("uma linha por paciente, números com vírgula decimal e situação em texto", () => {
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("Maria Souza;03/11/1990;35;;Maria Souza.pdf;Texto do PDF;Acima do limite;1;1;0;0;Glicose (jejum) 131,5 | Colesterol HDL 36;131,5;Acima do limite;36;Requer análise");
    expect(lines[2].split(";").slice(6, 11)).toEqual(["Dentro do padrão", "0", "0", "2", "0"]);
  });
  it("arquivo ilegível vira linha 'Não lido' com o motivo", () => {
    const l = buildBatchCsv([{ label: "scan", fileName: "scan.pdf", analysis: null, problem: "Sem texto selecionável" }], exams).split("\r\n")[1];
    expect(l).toContain("Não lido");
    expect(l).toContain("Sem texto selecionável");
  });
  it("marca a leitura por OCR para o médico conferir", () => {
    const l = buildBatchCsv([pac("Scan", "90", "50", { ocr: true })], exams).split("\r\n")[1];
    expect(l.split(";")[5]).toBe("OCR (conferir)");
    expect(buildSummaryText(pac("Scan", "90", "50", { ocr: true }), "P")).toContain("lido por reconhecimento de imagem (OCR)");
  });
  it("inclui o sexo (quando conhecido) na planilha e no resumo", () => {
    const l = buildBatchCsv([pac("Ana", "90", "50", { sex: "F", age: 30 })], exams).split("\r\n")[1];
    expect(l.split(";").slice(0, 4)).toEqual(["Ana", "", "30", "Feminino"]);
    expect(buildSummaryText(pac("Ana", "90", "50", { sex: "F", age: 30 }), "P")).toContain("Ana (30 anos, feminino)");
  });
  it("exame não localizado fica com valor vazio e situação 'Não localizado'", () => {
    const p: ExportPatient = { label: "X", fileName: "x.pdf", analysis: analyze([mk("Glicose", 700), mk("90", 700, 200)], rules, EXAMS) };
    expect(buildBatchCsv([p], exams).split("\r\n")[1]).toMatch(/;90;Dentro do padrão;;Não localizado$/);
  });
});

describe("segurança da planilha (nomes vêm de PDFs de terceiros)", () => {
  it.each([["=1+1"], ["+cmd|' /C calc'!A0"], ["-2+3"], ["@SUM(A1)"], ["\tformula"]])("neutraliza fórmulas: %s", (nome) => {
    expect(safeText(nome).startsWith("'")).toBe(true);
    const csv = buildBatchCsv([pac(nome, "90", "50")], exams).split("\r\n")[1];
    expect(csv.startsWith("'") || csv.startsWith('"\'')).toBe(true);
  });
  it("não altera textos normais e escapa aspas e ponto e vírgula", () => {
    expect(safeText("João da Silva")).toBe("João da Silva");
    const csv = buildBatchCsv([pac('Ana "Nana"; Souza', "90", "50")], exams).split("\r\n")[1];
    expect(csv.startsWith('"Ana ""Nana""; Souza";')).toBe(true);
  });
});

describe("resumo em texto do paciente", () => {
  const data = new Date(2026, 9, 22);
  it("separa atenção, dentro do padrão e não localizados, com valor e unidade", () => {
    const t = buildSummaryText(pac("Maria Souza", "131", "36", { age: 35 }), "Admissional", data);
    expect(t).toContain("Triagem de exames: Maria Souza (35 anos)");
    expect(t).toContain("Data: 22/10/2026 · Critérios: Admissional");
    expect(t).toContain("ACIMA DO LIMITE\n• Glicose (jejum): 131 mg/dL");
    expect(t).toContain("PARA ANÁLISE\n• Colesterol HDL: 36 mg/dL");
    expect(t).toContain("conferência e a interpretação clínica são do médico");
  });
  it("lista não localizados e nunca os coloca em 'dentro do padrão'", () => {
    const p: ExportPatient = { label: "X", fileName: "x.pdf", analysis: analyze([mk("Glicose", 700), mk("90", 700, 200)], rules, EXAMS) };
    const t = buildSummaryText(p, "P", data);
    expect(t).toContain("DENTRO DO PADRÃO\n• Glicose (jejum): 90 mg/dL");
    expect(t).toContain("NÃO LOCALIZADOS NO LAUDO\n• Colesterol HDL");
    expect(t.indexOf("NÃO LOCALIZADOS")).toBeGreaterThan(t.indexOf("DENTRO DO PADRÃO"));
  });
  it("laudo ilegível informa o motivo", () => {
    expect(buildSummaryText({ label: "S", fileName: "s.pdf", analysis: null, problem: "Sem texto" }, "P", data)).toContain("Não foi possível ler o laudo (s.pdf): Sem texto");
  });
});

it("nome do arquivo da planilha leva a data", () => {
  expect(csvFileName(new Date("2026-10-22T12:00:00Z"))).toBe("tolaris-triagem-2026-10-22.csv");
});
