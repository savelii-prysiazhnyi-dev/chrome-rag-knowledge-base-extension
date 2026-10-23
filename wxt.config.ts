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
// Bundle ONNX Runtime WASM + loader locally (MV3 CSP forbids remote code).
// Include all builds (standard, asyncify, jspi, jsep) so single-threaded non-isolated extension pages can load.
const ORT_ASSETS = readdirSync(ortDist).filter(f => f.startsWith('ort-wasm'));

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
