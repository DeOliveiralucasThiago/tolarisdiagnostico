import { itemsFromPdf } from "./pdf-items";
import type { TextItem } from "./types";

/**
 * Lê o PDF inteiramente no navegador. O arquivo nunca é enviado a servidor algum.
 */
export async function readPdfInBrowser(file: File | ArrayBuffer): Promise<TextItem[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  try {
    return await itemsFromPdf(pdf);
  } finally {
    await pdf.destroy();
  }
}
