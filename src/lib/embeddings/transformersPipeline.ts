import { MODEL_ID, type FeatureExtractor } from './embedder';

interface MinimalGpuDevice {
  destroy?: () => void;
}

interface MinimalGpuAdapter {
  requestDevice: () => Promise<MinimalGpuDevice | null>;
}

interface MinimalGpu {
  requestAdapter: () => Promise<MinimalGpuAdapter | null>;
}

/**
 * Probes whether a functional WebGPU adapter and device can actually be acquired.
 *
 * Checking `'gpu' in navigator` is insufficient: on Linux/Chromium without a
 * hardware WebGPU adapter enabled, `navigator.gpu` exists but `requestAdapter()`
 * resolves to `null`. Calling `pipeline(..., { device: 'webgpu' })` in that state
 * causes ONNX Runtime Web to throw `Failed to get GPU adapter` inside
 * `@huggingface/transformers`'s internal `webInitChain = webInitChain.then(load)`,
 * which permanently rejects `webInitChain` and poisons any subsequent `{ device: 'wasm' }`
 * fallback call.
 */
export async function hasUsableWebGpu(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      return false;
    }
    const gpu = (navigator as Navigator & { gpu?: MinimalGpu }).gpu;
    if (!gpu || typeof gpu.requestAdapter !== 'function') {
      return false;
    }
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return false;
    }
    const device = await adapter.requestDevice();
    if (!device) {
      return false;
    }
    device.destroy?.();
    return true;
  } catch {
    return false;
  }
}

let configuredWasmPaths: string | undefined;

/**
 * Explicitly configures the base URL / path for ONNX Runtime WASM assets.
 * Useful in Web Worker environments where `chrome.runtime.getURL` might not be directly available.
 */
export function setWasmPaths(wasmPaths: string | undefined): void {
  configuredWasmPaths = wasmPaths;
}

export function getWasmPaths(): string | undefined {
  return configuredWasmPaths;
}

/**
 * Loads the real Transformers.js pipeline. Browser-only (offscreen document / worker);
 * never imported by unit tests. ONNX Runtime WASM/.mjs files are bundled under
 * `ort/` (see wxt.config.ts) so no remote code is fetched (MV3 CSP). Only model
 * weights are downloaded from the HF hub on first run, then served by Cache API.
 */
export async function loadTransformersExtractor(options?: {
  wasmPaths?: string;
}): Promise<FeatureExtractor> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const onnx = env.backends.onnx;
  if (onnx.wasm) {
    const wasmPaths =
      options?.wasmPaths ??
      configuredWasmPaths ??
      (typeof chrome !== 'undefined' && chrome.runtime?.getURL
        ? chrome.runtime.getURL('ort/')
        : undefined);
    if (wasmPaths) {
      onnx.wasm.wasmPaths = wasmPaths;
    }
    onnx.wasm.numThreads = 1; // no cross-origin isolation => no SharedArrayBuffer
    onnx.wasm.proxy = false;
  }

  const useWebGpu = await hasUsableWebGpu();
  const attempts: Array<'webgpu' | 'wasm'> = useWebGpu
    ? ['webgpu', 'wasm']
    : ['wasm'];
  let lastErr: unknown;
  for (const device of attempts) {
    try {
      const extractor = await pipeline('feature-extraction', MODEL_ID, {
        device,
        dtype: device === 'webgpu' ? 'fp32' : 'q8',
      });
      console.log(`[Second Brain Offscreen/Worker] Model ready on ${device}`);
      return extractor as unknown as FeatureExtractor;
    } catch (err) {
      console.warn(
        `[Second Brain Offscreen/Worker] ${device} init failed:`,
        err,
      );
      lastErr = err;
    }
  }
  throw lastErr;
}
