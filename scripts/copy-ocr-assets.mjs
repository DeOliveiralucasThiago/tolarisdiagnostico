/**
 * Copia os arquivos do OCR (worker, núcleo WebAssembly e modelo de português) para public/ocr, para que o
 * navegador os baixe do PRÓPRIO site e não de CDNs de terceiros. Roda antes de `dev` e `build`.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public/ocr");
const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz", "lang/por.traineddata.gz"],
];

for (const [from, to] of files) {
  const src = path.join(root, from);
  if (!existsSync(src)) {
    console.error(`OCR: arquivo não encontrado: ${from}. Rode "npm install".`);
    process.exit(1);
  }
  mkdirSync(path.dirname(path.join(out, to)), { recursive: true });
  copyFileSync(src, path.join(out, to));
}
console.log("OCR: arquivos copiados para public/ocr");
