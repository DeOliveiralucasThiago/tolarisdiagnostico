import { readFileSync } from "node:fs";
import path from "node:path";
import { itemsFromPdf } from "@/lib/pdf-items";

export async function itemsFromSample(name: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(path.resolve(__dirname, "../public/samples", name)));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  return itemsFromPdf(pdf);
}

export async function itemsFromFixture(name: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(path.resolve(__dirname, "fixtures", name)));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  return itemsFromPdf(pdf);
}
