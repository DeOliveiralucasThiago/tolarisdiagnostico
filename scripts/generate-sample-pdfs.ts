/**
 * Gera PDFs de exemplo FICTÍCIOS (sem dados de pacientes) com layouts diferentes,
 * imitando como laboratórios distintos organizam os resultados.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve(__dirname, "../public/samples");

type Row = [name: string, result: string, unit: string, ref: string];

const ROWS: Row[] = [
  ["Glicose em jejum", "92", "mg/dL", "70 a 99"],
  ["Colesterol total", "214", "mg/dL", "inferior a 190"],
  ["Colesterol HDL", "38", "mg/dL", "superior a 40"],
  ["Colesterol LDL", "141", "mg/dL", "inferior a 130"],
  ["Triglicerídeos", "162", "mg/dL", "inferior a 150"],
  ["TGO (AST)", "27", "U/L", "até 40"],
  ["TGP (ALT)", "54", "U/L", "até 41"],
  ["Creatinina", "1,0", "mg/dL", "0,7 a 1,3"],
  ["Hemoglobina", "14,2", "g/dL", "13,5 a 17,5"],
  ["Plaquetas", "250.000", "/mm³", "150.000 a 450.000"],
  ["TSH", "2,35", "µUI/mL", "0,45 a 4,5"],
  ["Hemoglobina glicada", "5,2", "%", "inferior a 5,7"],
];

async function newDoc() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  const text = (s: string, x: number, y: number, size = 10, b = false) =>
    page.drawText(s, { x, y, size, font: b ? bold : font, color: rgb(0, 0, 0) });
  return { doc, text };
}

/** Layout A: Exame | Resultado | Unidade | Referência */
async function layoutA(rows: Row[] = ROWS, header: string[] = ["Paciente: PACIENTE DE TESTE"]) {
  const { doc, text } = await newDoc();
  text("LABORATORIO EXEMPLO A - Laudo de exames (FICTICIO)", 50, 800, 12, true);
  header.forEach((h, i) => text(h, 50, 782 - i * 12));
  text("Exame", 50, 740, 10, true);
  text("Resultado", 230, 740, 10, true);
  text("Unidade", 330, 740, 10, true);
  text("Valor de referência", 410, 740, 10, true);
  rows.forEach(([n, r, u, ref], i) => {
    const y = 720 - i * 20;
    text(n, 50, y);
    text(r, 230, y);
    text(u, 330, y);
    text(ref, 410, y);
  });
  return doc.save();
}

/** Layout B: ordem diferente (referência antes do resultado) e exames embaralhados */
async function layoutB(rows: Row[] = ROWS, header: string[] = []) {
  const { doc, text } = await newDoc();
  text("CLINICA EXEMPLO B - Resultados (FICTICIO)", 50, 800, 12, true);
  header.forEach((h, i) => text(h, 50, 782 - i * 12));
  text("Exame", 50, 740, 10, true);
  text("Valor de referência", 200, 740, 10, true);
  text("Resultado", 350, 740, 10, true);
  text("Unidade", 450, 740, 10, true);
  const shuffled = [...rows].reverse();
  shuffled.forEach(([n, r, u, ref], i) => {
    const y = 720 - i * 20;
    text(n.replace("Glicose em jejum", "Glicemia de jejum").replace("TGO (AST)", "AST/TGO").replace("TGP (ALT)", "ALT/TGP"), 50, y);
    text(ref, 200, y);
    text(r, 350, y);
    text(u, 450, y);
  });
  return doc.save();
}

/** Layout C: blocos em várias linhas, resultado na linha de baixo do nome */
async function layoutC(rows: Row[] = ROWS.slice(0, 8), header: string[] = []) {
  const { doc, text } = await newDoc();
  text("LABORATORIO EXEMPLO C - Laudo (FICTICIO)", 50, 800, 12, true);
  header.forEach((h, i) => text(h, 50, 784 - i * 12));
  rows.forEach(([n, r, u, ref], i) => {
    const y = 745 - i * 60;
    text(n.toUpperCase(), 50, y, 10, true);
    text(`Resultado: ${r} ${u}`, 50, y - 14);
    text("Método: Enzimático colorimétrico", 250, y - 14);
    text(`Valor de referência: ${ref} ${u}`, 50, y - 28);
  });
  return doc.save();
}

/** Pacientes FICTÍCIOS para demonstrar a análise em lote (nomes e dados inventados). */
const withValues = (values: Record<string, string>): Row[] =>
  ROWS.filter(([n]) => n in values).map(([n, , u, ref]) => [n, values[n], u, ref] as Row);

const JOAO: Row[] = withValues({
  "Glicose em jejum": "88", "Colesterol total": "175", "Colesterol HDL": "52", "Colesterol LDL": "98", "Triglicerídeos": "110",
  "TGO (AST)": "24", "TGP (ALT)": "28", "Creatinina": "0,9", "Hemoglobina": "15,1", "Plaquetas": "230.000", "TSH": "1,9", "Hemoglobina glicada": "5,2",
});
const MARIA: Row[] = withValues({
  "Glicose em jejum": "118", "Colesterol total": "252", "Colesterol HDL": "36", "Colesterol LDL": "171", "Triglicerídeos": "210",
  "TGO (AST)": "33", "TGP (ALT)": "47", "Creatinina": "1,0", "Hemoglobina": "12,6", "Plaquetas": "310.000", "TSH": "3,1", "Hemoglobina glicada": "5,9",
});
const JOSE: Row[] = withValues({
  "Glicose em jejum": "131", "Colesterol total": "205", "Colesterol HDL": "41", "Colesterol LDL": "142", "Triglicerídeos": "188",
  "TGO (AST)": "45", "TGP (ALT)": "38", "Creatinina": "1,4",
});

async function main() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "exemplo-layout-a.pdf"), await layoutA());
  writeFileSync(path.join(OUT, "exemplo-layout-b.pdf"), await layoutB());
  writeFileSync(path.join(OUT, "exemplo-layout-c.pdf"), await layoutC());
  writeFileSync(path.join(OUT, "paciente-joao.pdf"), await layoutA(JOAO, ["CLIENTE: JOÃO DA SILVA DN: 12/05/1985", "CONVÊNIO: EXEMPLO"]));
  writeFileSync(path.join(OUT, "paciente-maria.pdf"), await layoutB(MARIA, ["Paciente: MARIA SOUZA", "Data de nascimento: 03/11/1990"]));
  writeFileSync(path.join(OUT, "paciente-jose.pdf"), await layoutC(JOSE, ["Nome do paciente: JOSÉ SANTOS", "Nascimento: 21/08/1978"]));
  console.log("PDFs de exemplo gerados em", OUT);
}

main();
