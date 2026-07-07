// Stage the onnxruntime-web WASM runtime into static/ort/ so it's served same-origin
// (nothing leaves the device) and offline-capable. It's ~26MB, so it's gitignored and
// copied from node_modules on dev/build instead of being committed.
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const files = ['ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.mjs'];

const src = [
    join(webRoot, 'node_modules/onnxruntime-web/dist'),
    join(webRoot, '../node_modules/onnxruntime-web/dist'),
].find((d) => existsSync(join(d, files[0])));

if (!src) {
    console.error('[setup-ort] onnxruntime-web not found in node_modules; run `bun install`');
    process.exit(1);
}

const dst = join(webRoot, 'static/ort');
mkdirSync(dst, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dst, f));
console.log('[setup-ort] staged onnxruntime-web to static/ort');
