# WXT Manifest V3 Architecture & Process Model

> **Document Version:** 1.0.0  
> **Status:** Implemented (Phase 1)  
> **Subsystem:** Extension Core Scaffolding, Process Isolation & IPC Topology

---

## 1. Executive Summary & Architectural Motivation

Google Chrome's Manifest V3 (MV3) fundamentally transformed browser extension development by replacing persistent background pages with ephemeral Background Service Workers, locking down Content Security Policy (CSP), and introducing dedicated APIs such as the **Side Panel API** (`chrome.sidePanel`) and **Offscreen Documents API** (`chrome.offscreen`).

Building a privacy-first, local-first semantic retrieval system within these constraints requires orchestrating distinct execution environments—each with specific memory lifecycles, DOM access rules, hardware acceleration capabilities, and security boundaries.

`chrome-rag-knowledge-base-extension` is built using the **WXT** framework (`wxt.dev`) with TypeScript, React 19, and Tailwind CSS. This document details the 5 core entrypoints, their underlying Chrome OS processes, IPC topology, CSP configurations, and action behaviors.

---

## 2. Process Topology & Execution Contexts

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CHROME BROWSER ENGINE                                  │
│                                                                                        │
│  ┌──────────────────────────────┐                ┌──────────────────────────────────┐  │
│  │     Render Process (Tab)     │                │   Extension Renderer Process     │  │
│  │   (Content Script Context)   │                │      (Side Panel & Options)      │  │
│  │  - Isolated DOM execution    │                │  - React 19 + Tailwind UI        │  │
│  │  - document.cloneNode()      │                │  - Direct IDB read queries       │  │
│  │  - CSS Custom Highlight API  │                │  - openPanelOnActionClick        │  │
│  └──────────────┬───────────────┘                └────────────────┬─────────────────┘  │
│                 │                                                 │                    │
│                 │ chrome.runtime.sendMessage                      │ chrome.runtime     │
│                 │ (IPC serialization)                             │ .sendMessage       │
│                 ▼                                                 ▼                    │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                   Background Service Worker Process (Coordinator)                │  │
│  │  - Event-driven lifecycle (terminates after ~30s idle)                           │  │
│  │  - Tab state tracking & dynamic toolbar badge (✓)                                │  │
│  │  - Storage Quota Gatekeeper (navigator.storage.estimate vs maxStorageBytes)       │  │
│  │  - Keyboard shortcuts ('Alt+S' / remember-page command listener)                 │  │
│  └──────────────────────────────────────┬───────────────────────────────────────────┘  │
│                                         │                                              │
│                                         │ chrome.runtime.sendMessage                   │
│                                         ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                Offscreen Document Process (Dedicated AI Worker)                  │  │
│  │  - @huggingface/transformers (ONNX Runtime Web)                                  │  │
│  │  - WebGPU acceleration & WASM SIMD fallback ('wasm-unsafe-eval')                 │  │
│  │  - Normalized 384-dimensional Float32Array vector embedding pipeline             │  │
│  │  - Hybrid cosine similarity + lexical search execution                           │  │
│  └──────────────────────────────────────┬───────────────────────────────────────────┘  │
│                                         │                                              │
│                                         │ Direct IDB Read/Write (Zero IPC Overhead)    │
│                                         ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                Shared IndexedDB Origin (chrome-extension://<extension-id>)       │  │
│  │  - Store 1: 'articles' (Lightweight metadata, 3NF, fast listing)                 │  │
│  │  - Store 2: 'article_contents' (1:1 vertical partition: full text & Markdown)    │  │
│  │  - Store 3: 'chunks' (1:N text passages + binary Float32Array embeddings)        │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. The 5 Manifest V3 Entrypoints

### 3.1 Background Service Worker (`src/entrypoints/background/index.ts`)

- **Process Type:** Extension Service Worker (independent worker thread).
- **DOM Access:** **None** (No `window`, `document`, or DOM APIs).
- **Lifecycle:** **Ephemeral & Event-Driven**. Chrome spins up the service worker when an event fires (e.g., `chrome.commands.onCommand`, `chrome.tabs.onActivated`, `chrome.runtime.onMessage`) and terminates it after ~30 seconds of inactivity to save memory.
- **Key Responsibilities:**
  1. **Panel Behavior Configuration:** Enables `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so clicking the extension action icon instantly toggles the Side Panel.
  2. **Shortcut Dispatcher:** Catches `Alt+S` (`remember-page`) and invokes the shared `saveTab(tabId)` coordinator (same code path as the side panel's `SAVE_ACTIVE_TAB`), which sends `EXTRACT_PAGE` to the content script. A per-tab in-memory lock (`activeIngestions`) rejects duplicates; it is intentionally not persisted, so a service-worker restart simply clears it (re-saves are idempotent).
  3. **Storage Quota Gatekeeper:** Before ingestion, queries `navigator.storage.estimate()` and validates available quota against `StorageSettings.maxStorageBytes` (default `50 MB`).
  4. **Toolbar Icon & Badge Synchronization:** Dynamically switches the extension toolbar icon and badge based on the active tab's indexing status: displays the luminous cyan Knowledge Graph icon (`ICONS_ACTIVE`) with a green checkmark badge (`✓`) when the page is saved and indexed, and switches to the silver/grey Knowledge Graph icon (`ICONS_INACTIVE`) with cleared badge (`''`) when the tab is unindexed, navigated away, deleted, or on restricted schemes.

### 3.2 Content Script (`src/entrypoints/content/index.ts`)

- **Process Type:** Host Web Page Renderer process (isolated JavaScript world).
- **Matches:** `http://*/*` and `https://*/*`.
- **DOM Access:** **Full Live Page DOM access** via an isolated execution realm (global variables and prototypes are isolated from page scripts).
- **Key Responsibilities:**
  1. **Non-Destructive Extraction:** Uses `document.cloneNode(true)` to extract clean article text, metadata, and Markdown (`@mozilla/readability` + `DOMPurify` + `turndown`) without touching the live page DOM.
  2. **Recursive Token-Safe Chunking:** Splits plain text into ~150–180 word overlapping passages respecting sentence boundaries to stay within the 256-token limit of `all-MiniLM-L6-v2`.

### 3.3 Offscreen Document (`src/entrypoints/offscreen/index.html` & `main.ts`)

- **Process Type:** Extension Renderer process (hidden window).
- **DOM Access:** **Full DOM, Web Worker, and WebGPU access**.
- **Architectural Rationale:** Manifest V3 Background Service Workers do not support the WebGPU API (`navigator.gpu` is unavailable in Service Workers in Chrome MV3) and have constrained WebAssembly compilation limits. Chrome introduced the **Offscreen Documents API** (`chrome.offscreen`) specifically to run DOM-dependent, audio, or high-performance compute tasks that cannot run in service workers.
- **Key Responsibilities:**
  1. Loads `@huggingface/transformers` (v3) and ONNX Runtime Web.
  2. Generates 384-dimensional normalized `Float32Array` vectors for text chunks via WebGPU / WASM SIMD.
  3. Reads directly from the shared `chrome-extension://<id>` IndexedDB instance to perform hybrid cosine + lexical retrieval, eliminating multi-megabyte IPC serialization overhead across Chrome processes.

### 3.4 Side Panel Companion UI (`src/entrypoints/sidepanel/index.html`, `main.tsx`, `App.tsx`)

- **Process Type:** Extension Renderer process (docked alongside webpage).
- **DOM Access:** Full Extension DOM, React 19, and Tailwind CSS.
- **Architectural Rationale:** Traditional browser action popups close immediately whenever the user clicks into the web page, making reading, copy-pasting, and comparing notes frustrating. Chrome's Side Panel API provides a persistent companion surface that stays open across tab navigations within the window.
- **Key Responsibilities:**
  1. **Active Tab Status:** Dynamically renders contextual status banner (`Not saved yet` + `Remember (Alt+S)`).
  2. **Library Feed & Domain Filtering:** Instant browsing of saved articles with star filtering.
  3. **Hybrid Search Interface:** Real-time semantic concept search with snippet previews and jump links.
  4. **Live Storage Telemetry:** Visual quota dashboard reflecting current IndexedDB utilization against the 50 MB budget.

### 3.5 Full-Screen Knowledge Manager (`src/entrypoints/options/index.html`, `main.tsx`, `App.tsx`)

- **Process Type:** Extension Tab Renderer process (`options.html` with `open_in_tab: true`).
- **DOM Access:** Full Extension DOM, React 19, and Tailwind CSS.
- **Key Responsibilities:**
  1. **High-Density Article Management:** Searchable, sortable table view with multi-select checkboxes for bulk starring or deletion.
  2. **Storage Quota Governance:** Disk cap adjustment interface (`50 MB`, `100 MB`, `250 MB`, `500 MB`, `1 GB`) and physical disk safety indicators (`< 500 MB` guardrail).
  3. **Data Ownership & Portability:** Single-click export of the entire knowledge base to a `.zip` archive containing clean Markdown files with YAML frontmatter or a structured `.json` database backup.

---

## 4. Content Security Policy (CSP) & `wasm-unsafe-eval`

Manifest V3 enforces a strict Content Security Policy by default:

```
script-src 'self'; object-src 'self';
```

Under this default policy, WebAssembly instantiation that requires dynamic runtime code generation (e.g. WASM JIT, SIMD optimizations, or ONNX Runtime Web kernel compilation) is blocked with an `EvalError: Code generation from strings disallowed for this context`.

To enable high-performance client-side neural embedding inference via `@huggingface/transformers`, our `wxt.config.ts` explicitly configures:

```typescript
content_security_policy: {
  extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
}
```

### Why `wasm-unsafe-eval` is Secure:

- Unlike the legacy MV2 `'unsafe-eval'` directive, `'wasm-unsafe-eval'` **only allows compiling and executing WebAssembly modules**.
- It does **not** permit arbitrary JavaScript execution via `eval()`, `new Function()`, or `setTimeout(string)`.
- It fully complies with Chrome Web Store extension security requirements for on-device machine learning.

---

## 5. Native Chrome Action Integration (`openPanelOnActionClick`)

In older extension paradigms, clicking the extension action icon in the toolbar triggered a popup (`default_popup`). In Manifest V3, extensions can bind the action click directly to the native Side Panel:

```typescript
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
```

### Operational Behavior:

1. When the user clicks the toolbar icon, Chrome directly toggles the Side Panel open or closed.
2. No intermediary popup window is instantiated, reducing memory consumption.
3. If the user clicks `Alt+S`, the background listener captures the command and triggers ingestion without disrupting side panel state.

### 5.1 Dynamic Toolbar Icon & Badge Lifecycle

The extension action utilizes dynamic per-tab toolbar icons (`chrome.action.setIcon({ tabId, path })`) and badges (`chrome.action.setBadgeText({ tabId, text })`) to provide immediate ambient awareness of whether the currently visited web page exists in the local knowledge base:

| State                              | Visual Representation      | Squircle & Stroke                            | Graph Nodes & Edges                                  | Badge Indicator                  | Trigger Conditions                                                                  |
| :--------------------------------- | :------------------------- | :------------------------------------------- | :--------------------------------------------------- | :------------------------------- | :---------------------------------------------------------------------------------- |
| **Active** (Saved / Indexed)       | Luminous Cyan 4-Node Graph | Background `#151923`, Border `#164E63` (3px) | `#13DFD6` cyan nodes & connected edges               | Background `#10b981`, Text `'✓'` | Page canonical URL resolved in IndexedDB with status `indexed`                      |
| **Inactive** (Unindexed / Neutral) | Silver/Slate 4-Node Graph  | Background `#151923`, Border `#2D3748` (3px) | Slate-400 `#94A3B8` nodes, slate-500 `#64748B` edges | Empty badge text `''`            | New tab, unsaved page, deleted article, or non-HTTP scheme (`chrome://`, `edge://`) |

#### Synchronization Hooks:

- **Tab Switching & Navigation:** Monitored via `chrome.tabs.onActivated` and `chrome.tabs.onUpdated` (`changeInfo.status === 'complete'` or `changeInfo.url`).
- **Real-Time Article Ingestion:** Broadcasts `ARTICLE_INDEXED` and `DATABASE_UPDATED` (reasons: `article_saved`, `article_deleted`, `bulk_cleanup`) triggering `syncAllTabBadges()`.
- **Side Panel In-Place Removal:** `useActiveTab.removeTab` and `App.tsx`'s `onArticleDeleted` immediately revert the active tab's action icon to `ICONS_INACTIVE` and clear the badge text before cross-tab broadcast finishes.

---

## 6. IPC Data Contracts & Shared IndexedDB Origin

Because the Background Service Worker, Offscreen Document, Side Panel, and Options page run under the same extension origin (`chrome-extension://<extension-id>`), they share a single IndexedDB storage instance (`second_brain_db`).

- **Control IPC:** Only lightweight control messages (e.g. `{ type: 'SAVE_ACTIVE_TAB' }`, `{ type: 'CHECK_TAB_STATUS' }`, `{ type: 'GENERATE_EMBEDDINGS_JOB', target: 'offscreen', payload: { articleId, textChunks } }`) pass through `chrome.runtime.sendMessage`.
- **Zero-Copy Vector Storage:** Heavy binary vectors (`Float32Array(384)`) are written directly to IndexedDB by the Offscreen Document and queried in-place during semantic search. No serialized multi-megabyte Float32 arrays are sent over Chrome IPC.

---

## 7. Entrypoints Summary Matrix

| Entrypoint            | File Path                             | Chrome Context                 | DOM Access      | Hardware / Engine                                       |
| :-------------------- | :------------------------------------ | :----------------------------- | :-------------- | :------------------------------------------------------ |
| **Background**        | `src/entrypoints/background/index.ts` | Service Worker                 | No              | Event-driven coordinator, storage gatekeeper            |
| **Content Script**    | `src/entrypoints/content/index.ts`    | Page Renderer (isolated world) | Cloned Page DOM | `@mozilla/readability`, text chunker, CSS Highlight API |
| **Offscreen Worker**  | `src/entrypoints/offscreen/main.ts`   | Extension Renderer (unlisted)  | Extension DOM   | `@huggingface/transformers`, ONNX WASM SIMD, WebGPU     |
| **Side Panel**        | `src/entrypoints/sidepanel/main.tsx`  | Native Side Panel              | Extension DOM   | React 19, Tailwind CSS, search feed, storage meter      |
| **Knowledge Manager** | `src/entrypoints/options/main.tsx`    | Full Tab (`open_in_tab: true`) | Extension DOM   | React 19, Tailwind CSS, data table, `.zip` exporter     |
