import { describe, expect, it } from "vitest";
import { analyze, type Analysis } from "@/lib/analysis";
import { filterAndSort, type BatchItem } from "@/lib/batch";
import { EXAMS } from "@/lib/exams";
import { ageFrom, formatName, parsePatient } from "@/lib/patient";
import { DEFAULT_PRESET } from "@/lib/presets";
import type { TextItem } from "@/lib/types";

const mk = (str: string, y: number, x = 50): TextItem => ({ str, x, y, width: 60, page: 1 });
const header = (...lines: string[]) => lines.map((l, i) => mk(l, 800 - i * 12));

describe("parsePatient", () => {
  it("lê 'CLIENTE: nome DN: data' na mesma linha e ignora 'NOME MÉDICO'", () => {
    const info = parsePatient(header("NOME SOCIAL:", "CLIENTE: JOÃO DA SILVA DN: 12/05/1985", "NOME MÉDICO: THALES MENDES CRM MÉDICO: 123"));
    expect(info).toEqual({ name: "JOÃO DA SILVA", birth: "12/05/1985" });
  });
  it("lê 'Paciente:' e 'Data de nascimento:' em linhas separadas", () => {
    expect(parsePatient(header("Paciente: MARIA SOUZA", "Data de nascimento: 03/11/1990"))).toEqual({ name: "MARIA SOUZA", birth: "03/11/1990" });
  });
  it("lê 'Nome do paciente:' e 'Nascimento:'", () => {
    expect(parsePatient(header("Nome do paciente: JOSÉ SANTOS", "Nascimento: 21/08/1978"))).toEqual({ name: "JOSÉ SANTOS", birth: "21/08/1978" });
  });
  it("lê o CPF do cabeçalho (só se for válido) e ignora o resto da linha", () => {
    expect(parsePatient(header("CLIENTE: JOÃO DA SILVA DN: 12/05/1985", "CPF: 111.444.777-35 RG: 3252910"))).toEqual({ name: "JOÃO DA SILVA", birth: "12/05/1985", cpf: "11144477735" });
    expect(parsePatient(header("Paciente: ANA", "CPF 111.444.777-35")).cpf).toBe("11144477735");
    expect(parsePatient(header("Paciente: ANA", "CPF: 111.444.777-99")).cpf).toBeUndefined(); // dígitos verificadores errados
    expect(parsePatient(header("Paciente: ANA", "RG 12345678")).cpf).toBeUndefined();
  });
  it("sem cabeçalho reconhecível não inventa nome", () => {
    expect(parsePatient(header("RESULTADO DE EXAMES", "Glicose 92 mg/dL"))).toEqual({});
  });
});

it("formatName e ageFrom", () => {
  expect(formatName("JOÃO DA SILVA")).toBe("João da Silva");
  expect(ageFrom("07/02/1993", new Date(2026, 9, 22))).toBe(33);
  expect(ageFrom("30/12/1993", new Date(2026, 9, 22))).toBe(32);
  expect(ageFrom("xx", new Date())).toBeNull();
});

// três pacientes sintéticos, com o preset de exemplo (glicose: laranja >=100, vermelho >=126)
const patient = (glicose: string, hdl: string): TextItem[] => [
  mk("Glicose", 700), mk(glicose, 700, 200), mk("mg/dL", 700, 260),
  mk("Colesterol HDL", 680), mk(hdl, 680, 200), mk("mg/dL", 680, 260),
];
const analysis = (items: TextItem[]) => analyze(items, { glicose: DEFAULT_PRESET.rules.glicose, hdl: DEFAULT_PRESET.rules.hdl }, EXAMS);
const item = (label: string, a: Analysis | null): BatchItem => ({ id: label, label, fileName: `${label}.pdf`, analysis: a });

describe("analyze + filterAndSort (lote de pacientes)", () => {
  const joao = analysis(patient("88", "52")); // tudo verde
  const maria = analysis(patient("110", "36")); // 2 laranjas
  const jose = analysis(patient("131", "45")); // glicose vermelha, HDL verde
  const lista = [item("João", joao), item("Maria", maria), item("José", jose), item("Ana (PDF ilegível)", null)];

  it("pior situação de cada paciente", () => {
    expect([joao.worst, maria.worst, jose.worst]).toEqual(["green", "orange", "red"]);
    expect(jose.counts).toMatchObject({ red: 1, green: 1 });
  });

  const base = { status: "all", query: "", examId: "", sort: "critical" } as const;

  it("ordena do mais crítico ao menos crítico, ilegíveis no fim", () => {
    expect(filterAndSort(lista, base).map((p) => p.label)).toEqual(["José", "Maria", "João", "Ana (PDF ilegível)"]);
  });
  it("filtra por situação", () => {
    expect(filterAndSort(lista, { ...base, status: "attention" }).map((p) => p.label)).toEqual(["José", "Maria"]);
    expect(filterAndSort(lista, { ...base, status: "red" }).map((p) => p.label)).toEqual(["José"]);
    expect(filterAndSort(lista, { ...base, status: "green" }).map((p) => p.label)).toEqual(["João"]);
  });
  it("filtra por exame alterado", () => {
    expect(filterAndSort(lista, { ...base, examId: "hdl" }).map((p) => p.label)).toEqual(["Maria"]);
    expect(filterAndSort(lista, { ...base, examId: "glicose" }).map((p) => p.label)).toEqual(["José", "Maria"]);
  });
  it("busca por nome sem considerar acentos e ordena por nome", () => {
    expect(filterAndSort(lista, { ...base, query: "jose" }).map((p) => p.label)).toEqual(["José"]);
    expect(filterAndSort(lista, { ...base, sort: "name" }).map((p) => p.label)[0]).toBe("Ana (PDF ilegível)");
  });
  it("correção manual do médico muda a análise daquele paciente", () => {
    const corrigido = analyze(patient("131", "45"), { glicose: DEFAULT_PRESET.rules.glicose }, EXAMS, { glicose: "95" });
    expect(corrigido.worst).toBe("green");
  });
});
