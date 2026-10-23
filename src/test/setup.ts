import 'fake-indexeddb/auto';
import { defineBackground } from 'wxt/utils/define-background';

(
  globalThis as unknown as {
    defineBackground: typeof defineBackground;
  }
).defineBackground = defineBackground;
