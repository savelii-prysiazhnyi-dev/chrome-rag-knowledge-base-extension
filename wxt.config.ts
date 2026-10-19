import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
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
