import { ocrCanvasTwoPass } from "./ocr-browser";
import { OCR_MAX_PAGES, ocrScaleFor } from "./ocr";
import { itemsFromPdf } from "./pdf-items";
import type { TextItem } from "./types";

export interface ReadResult {
  items: TextItem[];
  /** true quando o texto veio de reconhecimento de imagem (OCR) e pode conter erros. */
  ocr: boolean;
  /** Segunda leitura do OCR (para conferir a primeira). */
  altItems?: TextItem[];
}

export interface ReadOptions {
  /** Mensagens de andamento, principalmente do OCR (que demora). */
  onStatus?: (message: string) => void;
}

/** Abaixo disto, o PDF é tratado como imagem (escaneado). */
const MIN_TEXT_ITEMS = 10;

const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;

export function isImageFile(file: { name: string; type?: string }): boolean {
  return (file.type?.startsWith("image/") ?? false) || IMAGE_EXT.test(file.name);
}
export function isPdfFile(file: { name: string; type?: string }): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}

/** Foto ou imagem de um laudo: reconhece o texto no próprio navegador. */
async function readImage(file: File, opts: ReadOptions): Promise<ReadResult> {
  opts.onStatus?.(`Reconhecendo texto da imagem ${file.name}…`);
  const bitmap = await createImageBitmap(file);
  // imagens pequenas são ampliadas e as enormes reduzidas, para ~2000 px de largura
  const scale = Math.min(3, Math.max(0.4, 2000 / bitmap.width));
  const canvas = newCanvas(bitmap.width * scale, bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // fundo branco para imagens com transparência
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const { items, altItems } = await ocrCanvasTwoPass(canvas, 1, scale);
  canvas.width = canvas.height = 0; // libera memória
  return { items, altItems, ocr: true };
}

/**
 * Lê PDF (com texto ou escaneado) ou imagem inteiramente no navegador. Nada é enviado a servidor.
 * PDFs sem texto (escaneados) passam por OCR automaticamente.
 */
export async function readFileInBrowser(source: File | ArrayBuffer, name = "", opts: ReadOptions = {}): Promise<ReadResult> {
  if (source instanceof File && isImageFile(source)) return readImage(source, opts);

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const data = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  try {
    const items = await itemsFromPdf(pdf);
    if (items.length >= MIN_TEXT_ITEMS) return { items, ocr: false };

    // sem texto: PDF escaneado -> OCR página a página
    if (pdf.numPages > OCR_MAX_PAGES) throw new Error(`PDF escaneado com mais de ${OCR_MAX_PAGES} páginas`);
    const out: TextItem[] = [];
    const alt: TextItem[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      opts.onStatus?.(`Reconhecendo texto de ${name || "PDF escaneado"}: página ${n} de ${pdf.numPages}…`);
      const page = await pdf.getPage(n);
      const scale = ocrScaleFor(page.getViewport({ scale: 1 }).width);
      const viewport = page.getViewport({ scale });
      const canvas = newCanvas(viewport.width, viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
      const pass = await ocrCanvasTwoPass(canvas, n, scale);
      out.push(...pass.items);
      alt.push(...pass.altItems);
      canvas.width = canvas.height = 0;
    }
    return { items: out, altItems: alt, ocr: true };
  } finally {
    await pdf.destroy();
  }
}

/** Compatível com o uso anterior (só os itens de texto). */
export async function readPdfInBrowser(file: File | ArrayBuffer): Promise<TextItem[]> {
  return (await readFileInBrowser(file)).items;
}
