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
async function layoutA() {
  const { doc, text } = await newDoc();
  text("LABORATORIO EXEMPLO A - Laudo de exames (FICTICIO)", 50, 800, 12, true);
  text("Paciente: PACIENTE DE TESTE", 50, 780);
  text("Exame", 50, 740, 10, true);
  text("Resultado", 230, 740, 10, true);
  text("Unidade", 330, 740, 10, true);
  text("Valor de referência", 410, 740, 10, true);
  ROWS.forEach(([n, r, u, ref], i) => {
    const y = 720 - i * 20;
    text(n, 50, y);
    text(r, 230, y);
    text(u, 330, y);
    text(ref, 410, y);
  });
  return doc.save();
}

/** Layout B: ordem diferente (referência antes do resultado) e exames embaralhados */
async function layoutB() {
  const { doc, text } = await newDoc();
  text("CLINICA EXEMPLO B - Resultados (FICTICIO)", 50, 800, 12, true);
  text("Exame", 50, 740, 10, true);
  text("Valor de referência", 200, 740, 10, true);
  text("Resultado", 350, 740, 10, true);
  text("Unidade", 450, 740, 10, true);
  const shuffled = [...ROWS].reverse();
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
async function layoutC() {
  const { doc, text } = await newDoc();
  text("LABORATORIO EXEMPLO C - Laudo (FICTICIO)", 50, 800, 12, true);
  ROWS.slice(0, 8).forEach(([n, r, u, ref], i) => {
    const y = 760 - i * 62;
    text(n.toUpperCase(), 50, y, 10, true);
    text(`Resultado: ${r} ${u}`, 50, y - 14);
    text("Método: Enzimático colorimétrico", 250, y - 14);
    text(`Valor de referência: ${ref} ${u}`, 50, y - 28);
  });
  return doc.save();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "exemplo-layout-a.pdf"), await layoutA());
  writeFileSync(path.join(OUT, "exemplo-layout-b.pdf"), await layoutB());
  writeFileSync(path.join(OUT, "exemplo-layout-c.pdf"), await layoutC());
  console.log("PDFs de exemplo gerados em", OUT);
}

main();
