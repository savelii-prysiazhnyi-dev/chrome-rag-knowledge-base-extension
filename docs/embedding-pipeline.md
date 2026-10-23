# Embedding Pipeline

Runs in a **Dedicated Web Worker** (`src/entrypoints/offscreen/worker.ts`) spawned by the **offscreen document** (`src/entrypoints/offscreen/main.ts`), giving the pipeline full WebGPU/WASM and IndexedDB access without blocking the Extension Renderer main thread.

## Process & Threading Model (Non-Blocking Web Worker)

In Chromium's extension process model, all extension pages belonging to the same extension ID (`sidepanel.html`, `options.html`, `offscreen.html`) share the same `chrome-extension://<id>` origin and execute in the **same Extension Renderer process on a single Blink main thread (JavaScript event loop)**.

If ONNX Runtime Web inference (`embedder.embed(textChunks)`) executed directly on that main thread, indexing an article with dozens of chunks would freeze the Side Panel UI and block frame rendering, button interactions, and animations.

To eliminate UI freezes:

1. **Dedicated Web Worker:** `src/entrypoints/offscreen/main.ts` spawns `worker.ts` via `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`. The worker runs on its own dedicated OS background thread.
2. **Message Bridge:** `main.ts` acts as a lightweight bridge listening to `chrome.runtime.onMessage` and forwarding tasks to the worker via `postMessage`.
3. **Direct IndexedDB Access:** Dedicated workers share the extension origin's `indexedDB` storage (`self.indexedDB`). The worker directly calls `saveArticleChunks()` and `markArticleFailed()`, completely avoiding the serialization of massive binary vector arrays (`Float32Array`) across `postMessage`.
4. **Local WASM Configuration:** `main.ts` computes `chrome.runtime.getURL('ort/')` and initializes the worker with `INIT`, allowing ONNX Runtime Web WASM binaries (`ort-wasm*`) to be loaded locally under MV3 CSP.

## Cooperative FIFO & Priority Job Queue (`jobQueue.ts`)

Concurrent calls to ONNX Runtime Web on the same session can cause race conditions or session corruptions. Furthermore, a user searching their knowledge base while a 50-chunk article is indexing should receive search results immediately, rather than waiting tens of seconds for the background indexing to complete.

The worker implements a cooperative priority and FIFO queue:

- **FIFO Normal-Priority Queue (Ingestion):** Multiple article embedding jobs are queued and processed sequentially.
- **Batch Chunk Slicing & Yielding:** Text chunks are embedded in small batches (default 8). After each slice, the worker yields to the event loop (`setTimeout(0)`), allowing incoming worker messages to be received.
- **High-Priority Preemption (Search & Related Articles):** `SEARCH_QUERY` and `FIND_RELATED_ARTICLES` tasks enter the high-priority queue. They execute immediately if the worker is idle, or run between batch slices of an in-flight indexing job, guaranteeing sub-second search responsiveness.
- **Fault Tolerance:** If an individual batch or search task fails, the error is isolated, the article is marked failed in IDB, and the queue automatically resumes processing subsequent jobs without deadlock.

## Model

`Xenova/all-MiniLM-L6-v2` (384-dim sentence embeddings) via `@huggingface/transformers` `feature-extraction` pipeline with `pooling: 'mean'`, `normalize: true`.

1. **WordPiece tokenization:** text is lowercased and split into sub-word tokens from a ~30k vocab (`playing` → `play`, `##ing`), wrapped in `[CLS]`/`[SEP]`, truncated to the model's max length (256 tokens; our ~160-word chunks fit).
2. **Encoder:** a 6-layer transformer produces one contextual vector per token.
3. **Mean pooling:** token vectors are averaged (masking padding) into one 384-d sentence vector.
4. **L2 normalization:** the vector is scaled to unit length.

### Why cosine == dot product

`cos(a,b) = a·b / (‖a‖‖b‖)`. With `‖a‖ = ‖b‖ = 1` the denominator is 1, so cosine equals the dot product, which is cheaper. `dotProduct` is used for ranking; `cosineSimilarity` remains for general (unnormalized) input and is safe for zero vectors / dimension mismatch.

## WebGPU vs WASM

`loadTransformersExtractor` probes for a usable WebGPU adapter and device via `hasUsableWebGpu()` (`navigator.gpu.requestAdapter()` → `adapter.requestDevice()` → `device.destroy()`) **before** calling `pipeline()`.

Checking `'gpu' in navigator` alone is insufficient: on Linux/Chromium without a hardware WebGPU adapter enabled, `navigator.gpu` exists on `Navigator` while `navigator.gpu.requestAdapter()` resolves to `null` (`No available adapters.`). If `pipeline('feature-extraction', MODEL_ID, { device: 'webgpu' })` is invoked in that state, ONNX Runtime Web throws `Error: Failed to get GPU adapter`. Inside `@huggingface/transformers` (`src/backends/onnx.js`), session creation is serialized on a module-scoped promise chain (`webInitChain = webInitChain.then(load)`) without a rejection recovery handler—meaning a single `'webgpu'` failure permanently rejects `webInitChain` and causes any subsequent `{ device: 'wasm' }` fallback call to immediately re-throw the cached `[webgpu]` error without ever attempting WASM initialization.

By gating `'webgpu'` behind `hasUsableWebGpu()`, environments without a functional GPU adapter go directly to `wasm` (`dtype: 'q8'`, 1 thread; no cross-origin isolation means no `SharedArrayBuffer`) and never poison `webInitChain`. All ONNX Runtime Web `.wasm`/`.mjs` loader variants (`ort-wasm*`, including `.asyncify`, `.jspi`, and `.jsep`) are bundled under `ort/` by `wxt.config.ts` (`build:publicAssets` hook) and located via `env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('ort/')`. MV3 CSP forbids remote code, and the manifest allows `'wasm-unsafe-eval'`.

## Model weight caching (only network access)

Weights (~23 MB quantized) are **not bundled**. On first use Transformers.js downloads them from the Hugging Face hub and stores them in the browser **Cache API**; later runs are offline. This is the extension's only network access. Bundling would inflate the package and was rejected as a trade-off.

## Offscreen lifecycle & Worker Bridge

The background coordinator calls `ensureOffscreenDocument()` which checks `chrome.runtime.getContexts` for an existing document and serializes creation with a singleton promise (reason `WORKERS`). The offscreen document (`main.ts`) instantiates the dedicated Web Worker (`worker.ts`) and bridges messages between `chrome.runtime.onMessage` and the worker's `postMessage` protocol.

The model is a lazy singleton inside the worker loaded on the first job or query. Messages are routed with `target: 'offscreen'`; the background coordinator ignores those and the offscreen document forwards them to the worker queue.

## Direct IndexedDB persistence from Web Worker

The Web Worker shares the extension origin's IndexedDB, so it calls `saveArticleChunks()` directly (atomic: chunks + `status: 'indexed'`) instead of passing ~1.5 KB-per-chunk vectors through `chrome.runtime` messaging (JSON-serialized, lossy for typed arrays). On failure it calls `markArticleFailed()`. Once persisted, the worker sends a lightweight event back to `main.ts`, which emits `ARTICLE_INDEXED` to Chrome runtime listeners.
