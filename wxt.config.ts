import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// onnxruntime-web is a transitive dependency of @huggingface/transformers.
const requireFromTransformers = createRequire(
  createRequire(import.meta.url).resolve('@huggingface/transformers'),
);
const ortDist = dirname(requireFromTransformers.resolve('onnxruntime-web'));
// Bundle ONNX Runtime WASM + loader locally (MV3 CSP forbids remote code).
const ORT_ASSETS = [
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
];

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  hooks: {
    'build:publicAssets': (_wxt, files) => {
      for (const f of ORT_ASSETS) {
        files.push({
          absoluteSrc: join(ortDist, f),
          relativeDest: `ort/${f}`,
        });
      }
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Second Brain — Local RAG Knowledge Assistant',
    description:
      'Privacy-first, on-device semantic knowledge assistant with WebGPU/WASM embeddings and hybrid vector search.',
    permissions: [
      'sidePanel',
      'offscreen',
      'storage',
      'activeTab',
      'tabs',
      'scripting',
    ],
    optional_permissions: ['unlimitedStorage' as never],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    action: {
      default_title: 'Open Second Brain Side Panel',
    },
    commands: {
      'remember-page': {
        suggested_key: {
          default: 'Alt+S',
        },
        description: 'Remember (save) the current page to your Second Brain',
      },
    },
  },
});
