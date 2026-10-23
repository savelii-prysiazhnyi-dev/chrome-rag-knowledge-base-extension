import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// onnxruntime-web is a transitive dependency of @huggingface/transformers.
const requireFromTransformers = createRequire(
  createRequire(import.meta.url).resolve('@huggingface/transformers'),
);
const ortDist = dirname(requireFromTransformers.resolve('onnxruntime-web'));
// Only bundle the two required WASM execution variants:
// 1. ort-wasm-simd-threaded.jsep.* for hardware WebGPU acceleration
// 2. ort-wasm-simd-threaded.asyncify.* for single-threaded WASM CPU fallback
// Exclude multi-threaded (requires unavailable SharedArrayBuffer) and experimental jspi builds.
const ORT_ASSETS = readdirSync(ortDist).filter(
  f =>
    (f.includes('jsep') || f.includes('asyncify')) &&
    (f.endsWith('.wasm') || f.endsWith('.mjs')),
);

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
    plugins: [
      tailwindcss(),
      {
        name: 'vite-plugin-eliminate-duplicate-wasm',
        generateBundle(_options, bundle) {
          // Eliminate duplicate WASM assets emitted into assets/ by Vite's static asset analyzer.
          // ONNX Runtime Web loads WASM assets directly from chrome.runtime.getURL('ort/').
          for (const fileName of Object.keys(bundle)) {
            if (
              fileName.startsWith('assets/ort-wasm') ||
              (fileName.startsWith('assets/') && fileName.endsWith('.wasm'))
            ) {
              delete bundle[fileName];
            }
          }
        },
      },
    ],
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
    host_permissions: ['http://*/*', 'https://*/*'],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    action: {
      default_title: 'Second Brain — Local RAG Knowledge Assistant',
      default_icon: {
        16: 'icons/icon-16-inactive.png',
        32: 'icons/icon-32-inactive.png',
        48: 'icons/icon-48-inactive.png',
        128: 'icons/icon-128-inactive.png',
      },
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
