import { binarizeAdaptive, estimateSkew, grayFromRgba, linesToItems, type OcrLine } from "./ocr";
import type { TextItem } from "./types";

// Tipos mínimos do worker (a biblioteca só é carregada no navegador, sob demanda).
interface OcrWorker {
  recognize(image: HTMLCanvasElement, opts?: object, output?: object): Promise<{ data: { blocks: { paragraphs: { lines: OcrLine[] }[] }[] | null } }>;
  setParameters(params: Record<string, string>): Promise<unknown>;
  terminate(): Promise<unknown>;
}

let workerPromise: Promise<OcrWorker> | null = null;
// Um reconhecimento por vez: cada um usa bastante CPU e memória.
let queue: Promise<unknown> = Promise.resolve();

async function getWorker(): Promise<OcrWorker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import("tesseract.js");
    // Arquivos hospedados no próprio site (public/ocr): nenhuma imagem e nenhum dado saem do computador.
    const worker = (await createWorker("por", 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr",
      langPath: "/ocr/lang",
      gzip: true,
    })) as unknown as OcrWorker;
    // Laudos são tabelas: tratar a página como um bloco único mantém cada linha inteira.
    await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
    return worker;
  })().catch((e) => {
    workerPromise = null;
    throw e;
  });
  return workerPromise;
}

/** Reconhece o texto de uma página já desenhada em `canvas`. */
export function ocrCanvas(canvas: HTMLCanvasElement, page: number, scale: number): Promise<TextItem[]> {
  const run = async () => {
    const worker = await getWorker();
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
    return linesToItems(lines, page, canvas.height, scale);
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** Libera a memória do OCR (chamar ao terminar um lote). */
export async function terminateOcr(): Promise<void> {
  const current = workerPromise;
  workerPromise = null;
  if (current) await (await current.catch(() => null))?.terminate();
}

function rotated(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const a = (deg * Math.PI) / 180;
  const w = Math.ceil(Math.abs(src.width * Math.cos(a)) + Math.abs(src.height * Math.sin(a)));
  const h = Math.ceil(Math.abs(src.width * Math.sin(a)) + Math.abs(src.height * Math.cos(a)));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(a);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

export interface TwoPassResult {
  items: TextItem[];
  /** Segunda leitura, sobre a imagem com pré-tratamento. Serve para conferir a primeira. */
  altItems: TextItem[];
}

/**
 * Endireita a imagem e a lê duas vezes: como está e com pré-tratamento (limiarização adaptativa). Onde as
 * duas leituras divergem, o valor é marcado para conferência, o que pega erros que uma leitura só não pega.
 */
export async function ocrCanvasTwoPass(canvas: HTMLCanvasElement, page: number, scale: number): Promise<TwoPassResult> {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const skew = estimateSkew(grayFromRgba(img.data, canvas.width, canvas.height), canvas.width, canvas.height);
  const straight = skew ? rotated(canvas, skew) : canvas;

  const items = await ocrCanvas(straight, page, scale);

  const sctx = straight.getContext("2d")!;
  const px = sctx.getImageData(0, 0, straight.width, straight.height);
  const bin = binarizeAdaptive(px.data, straight.width, straight.height);
  const treated = document.createElement("canvas");
  treated.width = straight.width;
  treated.height = straight.height;
  treated.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(bin), straight.width, straight.height), 0, 0);
  const altItems = await ocrCanvas(treated, page, scale);

  treated.width = treated.height = 0;
  if (straight !== canvas) straight.width = straight.height = 0;
  return { items, altItems };
}
