# Embedding Pipeline

Runs in the **offscreen document** (`src/entrypoints/offscreen/main.ts`), which has DOM/WebGPU/WASM access that the MV3 service worker lacks.

## Model

`Xenova/all-MiniLM-L6-v2` (384-dim sentence embeddings) via `@huggingface/transformers` `feature-extraction` pipeline with `pooling: 'mean'`, `normalize: true`.

1. **WordPiece tokenization:** text is lowercased and split into sub-word tokens from a ~30k vocab (`playing` → `play`, `##ing`), wrapped in `[CLS]`/`[SEP]`, truncated to the model's max length (256 tokens; our ~160-word chunks fit).
2. **Encoder:** a 6-layer transformer produces one contextual vector per token.
3. **Mean pooling:** token vectors are averaged (masking padding) into one 384-d sentence vector.
4. **L2 normalization:** the vector is scaled to unit length.

### Why cosine == dot product

`cos(a,b) = a·b / (‖a‖‖b‖)`. With `‖a‖ = ‖b‖ = 1` the denominator is 1, so cosine equals the dot product, which is cheaper. `dotProduct` is used for ranking; `cosineSimilarity` remains for general (unnormalized) input and is safe for zero vectors / dimension mismatch.

## WebGPU vs WASM

`loadTransformersExtractor` tries `webgpu` (fp32) when `navigator.gpu` exists, falling back to `wasm` (q8, 1 thread; no cross-origin isolation means no `SharedArrayBuffer`) if initialization fails. ONNX Runtime `.wasm`/`.mjs` are bundled under `ort/` by `wxt.config.ts` (`build:publicAssets` hook) and located via `env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('ort/')`. MV3 CSP forbids remote code, and the manifest already allows `'wasm-unsafe-eval'`.

## Model weight caching (only network access)

Weights (~23 MB quantized) are **not bundled**. On first use Transformers.js downloads them from the Hugging Face hub and stores them in the browser **Cache API**; later runs are offline. This is the extension's only network access. Bundling would inflate the package and was rejected as a trade-off.

## Offscreen lifecycle

The background `ensureOffscreenDocument()` checks `chrome.runtime.getContexts` for an existing document and serializes creation with a singleton promise (reason `WORKERS`). The model is a lazy singleton (`Embedder`) loaded on the first job or query; embedding runs in small batches (default 8). Messages are routed with `target: 'offscreen'`; the background ignores those and the offscreen document ignores everything else.

## Direct IndexedDB write

The offscreen document shares the extension origin's IndexedDB, so it calls `saveArticleChunks` directly (atomic: chunks + `status: 'indexed'`) instead of passing ~1.5 KB-per-chunk vectors through `chrome.runtime` messaging (JSON-serialized, lossy for typed arrays). On failure it calls `markArticleFailed`. It then sends a lightweight `ARTICLE_INDEXED` to the background (errors for no receiver are swallowed).
