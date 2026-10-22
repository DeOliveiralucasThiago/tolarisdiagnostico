import type { TextItem } from "./types";

/** Subconjunto do PDFDocumentProxy do pdf.js que usamos (evita acoplar ao build do navegador ou do Node). */
interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
}

export async function itemsFromPdf(pdf: PdfDocLike): Promise<TextItem[]> {
  const items: TextItem[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
      if (!it.str || !it.transform) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width ?? 0, page: p });
    }
  }
  return items;
}
