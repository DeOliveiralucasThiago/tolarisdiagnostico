import { linesToItems, type OcrLine } from "./ocr";
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
