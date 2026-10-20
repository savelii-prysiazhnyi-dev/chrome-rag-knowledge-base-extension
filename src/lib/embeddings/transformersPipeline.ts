import { MODEL_ID, type FeatureExtractor } from './embedder';

/**
 * Loads the real Transformers.js pipeline. Browser-only (offscreen document);
 * never imported by unit tests. ONNX Runtime WASM/.mjs files are bundled under
 * `ort/` (see wxt.config.ts) so no remote code is fetched (MV3 CSP). Only model
 * weights are downloaded from the HF hub on first run, then served by Cache API.
 */
export async function loadTransformersExtractor(): Promise<FeatureExtractor> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const onnx = env.backends.onnx;
  if (onnx.wasm) {
    onnx.wasm.wasmPaths = chrome.runtime.getURL('ort/');
    onnx.wasm.numThreads = 1; // no cross-origin isolation => no SharedArrayBuffer
    onnx.wasm.proxy = false;
  }

  const attempts: Array<'webgpu' | 'wasm'> =
    typeof navigator !== 'undefined' && 'gpu' in navigator
      ? ['webgpu', 'wasm']
      : ['wasm'];
  let lastErr: unknown;
  for (const device of attempts) {
    try {
      const extractor = await pipeline('feature-extraction', MODEL_ID, {
        device,
        dtype: device === 'webgpu' ? 'fp32' : 'q8',
      });
      console.log(`[Second Brain Offscreen] Model ready on ${device}`);
      return extractor as unknown as FeatureExtractor;
    } catch (err) {
      console.warn(`[Second Brain Offscreen] ${device} init failed:`, err);
      lastErr = err;
    }
  }
  throw lastErr;
}
