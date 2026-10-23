# Second Brain: On-Device Semantic Knowledge Assistant

> **Chrome Extension Manifest V3 • 100% Local-First • WebGPU / WASM Neural Embeddings • Hybrid Vector Search**

A privacy-first, local-first semantic retrieval extension that turns Google Chrome into an intelligent reading companion and personal knowledge assistant ("Second Brain"). Second Brain extracts, distills, embeds, and indexes web articles entirely on your local machine using client-side machine learning (`@huggingface/transformers` with `all-MiniLM-L6-v2`), a 3NF vertically partitioned IndexedDB storage engine, and a hybrid dense-plus-lexical vector search engine.

Zero cloud servers. Zero telemetry. Zero API keys. Everything stays inside your browser profile.

<video src="https://github.com/user-attachments/assets/8d305a80-ce10-4f2f-a28e-4bc22b569ffb" controls autoplay loop muted width="100%"></video>
---

## Table of Contents

- [Features](#features)
- [Architecture & Process Topology](#architecture--process-topology)
  - [Process Isolation & Execution Realms](#process-isolation--execution-realms)
  - [Zero-IPC Direct Binary Persistence](#zero-ipc-direct-binary-persistence)
- [Monorepo & Source Directory Layout](#monorepo--source-directory-layout)
- [Prerequisites & Tooling](#prerequisites--tooling)
- [Getting Started & Installation Guide](#getting-started--installation-guide)
  - [1. Install Dependencies](#1-install-dependencies)
  - [2. Build the Extension](#2-build-the-extension)
  - [3. Load Unpacked Extension into Chrome](#3-load-unpacked-extension-into-chrome)
  - [4. Pin to Toolbar & Keyboard Shortcuts](#4-pin-to-toolbar--keyboard-shortcuts)
- [Core Subsystems & Technical Deep-Dive](#core-subsystems--technical-deep-dive)
  - [1. Content Extraction Pipeline (`docs/content-pipeline.md`)](#1-content-extraction-pipeline)
  - [2. On-Device Neural Embedding Pipeline (`docs/embedding-pipeline.md`)](#2-on-device-neural-embedding-pipeline)
  - [3. Hybrid Vector + Lexical Search (`docs/hybrid-search.md`)](#3-hybrid-vector--lexical-search)
  - [4. 3NF Relational + Vector Storage Engine (`docs/storage-engine.md`)](#4-3nf-relational--vector-storage-engine)
  - [5. Side Panel & Knowledge Manager UI (`docs/ui-and-export-architecture.md`)](#5-side-panel--knowledge-manager-ui)
  - [6. Manifest V3 Lifecycle & Action Topology (`docs/wxt-mv3-architecture.md`)](#6-manifest-v3-lifecycle--action-topology)
- [Manifest V3 Entrypoints & IPC Contracts](#manifest-v3-entrypoints--ipc-contracts)
  - [Entrypoints Overview](#entrypoints-overview)
  - [Inter-Process Communication (IPC) Protocol](#inter-process-communication-ipc-protocol)
- [Scripts & Quality Verification](#scripts--quality-verification)
- [Security, Privacy & Compliance Model](#security-privacy--compliance-model)

---

## Features

- **1-Click Explicit Curation (`Remember` & `Alt+S`):** Curation is strictly user-driven. Save the active tab via the persistent Side Panel button or press `Alt+S` from any webpage. The Background Service Worker immediately coordinates non-destructive extraction and indexing.
- **Non-Destructive Cloned DOM Distillation:** Content extraction clones the webpage DOM (`document.cloneNode(true)`) and processes it in an isolated realm using `@mozilla/readability`, `DOMPurify`, and `turndown`. The live webpage DOM is never mutated or interfered with.
- **Recursive Overlapping Sliding-Window Chunking:** Extracted clean plain text is split into ~150–180 word overlapping passages respecting sentence boundaries, ensuring passages fit comfortably within the 256-token context window of `all-MiniLM-L6-v2`.
- **100% On-Device Neural Embeddings:** Generates 384-dimensional normalized `Float32Array` embeddings using `@huggingface/transformers` (v3) running inside an Offscreen Document. Automatically leverages hardware-accelerated **WebGPU** when available, with a robust fallback to **WASM SIMD** (`q8` quantized weights).
- **Hybrid Dense + Lexical Vector Search:** Combines dense cosine similarity (using fast dot product on unit-normalized vectors) with BM25-style lexical keyword matching via an adjustable alpha parameter (`score = α * dense + (1 - α) * lexical`). Dynamic snippet extraction pinpoints the exact matching passage.
- **3NF Vertically Partitioned IndexedDB:** High-performance relational schema partitioning metadata (`articles`), full text and Markdown (`article_contents`), and vector embeddings (`chunks`) across separate stores in IndexedDB. Yields sub-millisecond feed queries and zero orphaned vectors on deletion.
- **Two-Layer Storage Quota Gatekeeper:** Enforces a conservative default user cap of **50 MB** with pre-flight quota checks before saving. Calculates logical payload footprint to prevent browser LevelDB directory bloat from affecting meters, protects unstarred articles, and provides optional one-click expansion to `unlimitedStorage`.
- **Ambient Toolbar Icon Telemetry:** Dynamically updates the Chrome toolbar action icon based on active tab indexing status: displays a luminous cyan Knowledge Graph icon (`ICONS_ACTIVE`) when the page is saved, and transitions to a neutral silver/grey icon (`ICONS_INACTIVE`) when unindexed, navigating, or deleted.
- **Persistent Side Panel Companion UI:** Built with React 19 and Tailwind CSS v4 in a modern dark slate / luminous cyan aesthetic (`#0F172A` / `#13DFD6`). Offers instant search, domain filtering pills, reading time badges, star pinning, and related article recommendations.
- **Full-Screen Knowledge Manager (`options.html`):** High-density tabular workspace featuring multi-select batch deletion, instant starring, Markdown reader view modal, age-based bulk cleanup drawer, and configurable storage budget presets (`50 MB` to `1 GB`).
- **Zero-Lock-In Export (`fflate`):** Export your entire knowledge base in one click to a standard `.zip` archive containing clean Markdown files with YAML frontmatter, or download a structured `.json` backup for portability across Obsidian, Logseq, or local LLMs.

---

## Architecture & Process Topology

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CHROME BROWSER ENGINE                                  │
│                                                                                        │
│  ┌──────────────────────────────┐                ┌──────────────────────────────────┐  │
│  │     Render Process (Tab)     │                │   Extension Renderer Process     │  │
│  │   (Content Script Context)   │                │      (Side Panel & Options)      │  │
│  │  - Isolated DOM execution    │                │  - React 19 + Tailwind CSS v4    │  │
│  │  - document.cloneNode()      │                │  - Direct IDB read queries       │  │
│  │  - Readability + Turndown    │                │  - openPanelOnActionClick        │  │
│  └──────────────┬───────────────┘                └────────────────┬─────────────────┘  │
│                 │                                                 │                    │
│                 │ chrome.runtime.sendMessage                      │ chrome.runtime     │
│                 │ (IPC serialization)                             │ .sendMessage       │
│                 ▼                                                 ▼                    │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                   Background Service Worker Process (Coordinator)                │  │
│  │  - Event-driven lifecycle (terminates after ~30s idle)                           │  │
│  │  - Active tab tracking & dynamic toolbar icon synchronization                    │  │
│  │  - Storage Quota Gatekeeper (Logical footprint vs maxStorageBytes)               │  │
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

### Process Isolation & Execution Realms

Chrome Manifest V3 enforces strict security boundaries between execution realms:

1. **Content Script Realm:** Executes inside the webpage renderer process but within an isolated JavaScript world. It has full read access to the page DOM but cannot access extension pages or WebGPU APIs.
2. **Background Service Worker:** Runs in an ephemeral background thread without a DOM (`window` and `document` are undefined). Responsible for tab lifecycle events, keyboard shortcuts, and storage coordination.
3. **Offscreen Document Realm:** Runs in a hidden HTML document (`offscreen.html`) specifically created with `reasons: ['WORKERS']`. It possesses a full DOM environment, enabling WebGPU hardware acceleration and ONNX Runtime Web WASM compilation.
4. **Side Panel & Options Pages:** Share the extension origin and render React 19 UI surfaces.

### Zero-IPC Direct Binary Persistence

In traditional extensions, passing thousands of 384-dimensional `Float32Array` vectors (1,536 bytes each) from an AI worker to storage requires serializing binary data across `chrome.runtime.sendMessage` IPC bridges, causing massive JSON serialization penalties and memory duplication.

Because the **Offscreen Document**, **Side Panel**, and **Options Page** share the exact same Chrome extension origin (`chrome-extension://<id>`), they share a single IndexedDB database instance. The Offscreen Document writes chunk vectors directly into IndexedDB (`saveArticleChunks()`), completely bypassing Chrome runtime IPC for high-volume binary data.

---

## Monorepo & Source Directory Layout

```
chrome-rag-knowledge-base-extension/
├── docs/                                 # Architectural specifications & deep-dive guides
│   ├── SPECIFICATION.md                 # Master product, schema, and ADR specification
│   ├── content-pipeline.md              # Readability, DOMPurify, Turndown & chunking
│   ├── embedding-pipeline.md            # WebGPU/WASM MiniLM encoder & Cache API lifecycle
│   ├── hybrid-search.md                 # Hybrid ranking math, alpha weighting & aggregation
│   ├── sample-user-flow.mmd             # Mermaid sequence diagrams for ingestion & search
│   ├── storage-engine.md                # 3NF relational IndexedDB schema & quota gatekeeper
│   ├── ui-and-export-architecture.md    # Side Panel, Knowledge Manager & fflate export
│   └── wxt-mv3-architecture.md          # Manifest V3 process model & IPC topology
├── public/                              # Static extension assets
│   └── icons/                           # 4-node Knowledge Graph icons (SVG & PNG 16..128px)
├── src/
│   ├── assets/                          # Global CSS styling
│   │   └── tailwind.css                 # Tailwind CSS v4 imports & theme tokens
│   ├── constants/                       # Shared immutable configuration
│   │   └── icons.ts                     # Toolbar icon path mappings (active vs inactive)
│   ├── db/                              # Relational & vector storage engine (idb)
│   │   ├── client.ts                    # IndexedDB singleton connection & schema upgrade
│   │   ├── quota.ts                     # Two-layer storage quota & logical bytes estimator
│   │   ├── repository.ts                # CRUD operations, bulk cleanup & cascading deletes
│   │   ├── schema.ts                    # 3NF database schema & index definitions
│   │   └── __tests__/                   # Database & quota unit test suite
│   ├── entrypoints/                     # Manifest V3 extension entrypoints
│   │   ├── background/                  # Service Worker entrypoint
│   │   │   ├── coordinator.ts           # Ingestion coordinator & in-memory locking
│   │   │   ├── index.ts                 # Service worker listeners & badge synchronization
│   │   │   └── __tests__/               # Background coordinator & badge sync tests
│   │   ├── content/                     # Content script entrypoint
│   │   │   └── index.ts                 # DOM extraction listener & message handler
│   │   ├── offscreen/                   # Offscreen Document entrypoint
│   │   │   ├── index.html               # Hidden DOM container
│   │   │   └── main.ts                  # Transformers.js embedding & search runner
│   │   ├── options/                     # Full-Screen Knowledge Manager (options.html)
│   │   │   ├── App.tsx                  # Tabular manager layout & drawers
│   │   │   ├── components/              # Table, row, header, modals, cleanup drawer
│   │   │   ├── hooks/                   # useKnowledgeManager state hook
│   │   │   ├── index.html               # Options page HTML container
│   │   │   ├── main.tsx                 # React 19 root bootstrap
│   │   │   └── __tests__/               # Options UI components test suite
│   │   └── sidepanel/                   # Side Panel Companion UI (sidepanel.html)
│   │       ├── App.tsx                  # Side Panel layout (library, search, status)
│   │       ├── components/              # Banners, cards, pills, search bar, modals
│   │       ├── hooks/                   # useActiveTab, useLibraryArticles, useSearch
│   │       ├── index.html               # Side panel HTML container
│   │       ├── main.tsx                 # React 19 root bootstrap
│   │       └── __tests__/               # Side panel UI components test suite
│   ├── hooks/                           # Cross-window synchronized hooks
│   │   ├── useStorageQuota.ts           # Real-time storage telemetry hook
│   │   └── __tests__/                   # Cross-window runtime sync tests
│   ├── lib/                             # Core algorithms & utilities
│   │   ├── content/                     # Content distillation & chunking logic
│   │   │   ├── canonicalizeUrl.ts       # URL normalization & tracking param stripper
│   │   │   ├── chunkText.ts             # Overlapping sliding-window passage chunker
│   │   │   ├── distillDocument.ts       # Cloned DOM Readability & Turndown engine
│   │   │   ├── guardrails.ts            # Restricted scheme & sensitive domain filter
│   │   │   ├── hashUrl.ts               # SHA-256 canonical URL hasher
│   │   │   └── __tests__/               # Distillation & chunking test suites
│   │   ├── embeddings/                  # Neural vector embedding engine
│   │   │   ├── embedder.ts              # Batched feature extractor wrapper
│   │   │   ├── transformersPipeline.ts  # WebGPU probe & WASM SIMD loader
│   │   │   └── __tests__/               # Embedder test suite
│   │   ├── export/                      # Zero-lock-in data portability
│   │   │   ├── index.ts                 # fflate .zip generator & .json backup builder
│   │   │   └── __tests__/               # Export verification test suite
│   │   ├── search/                      # Hybrid retrieval algorithms
│   │   │   ├── hybrid.ts                # Convex combination ranking formula
│   │   │   ├── lexical.ts               # Tokenized BM25-style lexical scoring
│   │   │   ├── similarity.ts            # Fast dot product & cosine similarity
│   │   │   └── __tests__/               # Search ranking test suite
│   │   └── utils/                       # String & date formatters
│   ├── test/                            # Global test setup & mock definitions
│   └── types/                           # Shared IPC and data contracts
│       └── messages.ts                  # Discriminated union message protocol & schemas
├── wxt.config.ts                        # WXT framework configuration & asset bundler
├── package.json                         # Project dependencies, scripts & SemVer
├── tsconfig.json                        # Strict TypeScript compiler options
├── vitest.config.ts                     # Vitest test runner configuration
├── .oxlintrc.json                       # Fast Oxlint rules configuration
└── CHANGELOG.md                         # Keep a Changelog release notes
```

---

## Prerequisites & Tooling

Before setting up the project, ensure your environment meets the following requirements:

- **Node.js:** `v20.18.0` or higher (`v22.x` LTS recommended)
- **pnpm:** `v9.x` or higher (tested with `pnpm@12.14.0`)
- **Google Chrome:** `v116.0` or higher (Chrome 116+ is required for the `chrome.sidePanel` and `chrome.offscreen` APIs)
- **WebGPU Support (Optional but recommended):** Modern GPU with Vulkan/DirectX12/Metal drivers. If unsupported, the extension automatically falls back to CPU WASM SIMD.

---

## Getting Started & Installation Guide

### 1. Install Dependencies

Clone the repository and install dependencies using `pnpm`:

```bash
pnpm install
```

_(Note: `pnpm install` will automatically execute `wxt prepare` to generate Manifest V3 TypeScript definitions under `.wxt/`)._

### 2. Build the Extension

Compile the extension and bundle ONNX Runtime WASM assets:

```bash
# Production Build
pnpm run build

# Development Mode with Live Hot Module Replacement (HMR)
pnpm run dev
```

The compiled Chrome Extension will be generated in the `.output/chrome-mv3/` directory.

### 3. Load Unpacked Extension into Chrome

1. Open Google Chrome and navigate to:
   ```
   chrome://extensions
   ```
2. Enable the **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button in the top-left toolbar.
4. Select the build output directory:
   ```
   <path-to-repository>/.output/chrome-mv3
   ```
5. The extension **Second Brain — Local RAG Knowledge Assistant** will now appear in your extensions list.

### 4. Pin to Toolbar & Keyboard Shortcuts

1. Click the puzzle icon (Extensions) in the Chrome toolbar and pin **Second Brain**.
2. Click the extension toolbar icon to open the **Side Panel**.
3. Navigate to any article on the web (e.g., Wikipedia, GitHub blogs, technical documentation) and press:
   - **`Alt + S`** (or click **`Remember this page`** in the Side Panel).
4. Watch the toolbar icon turn from **neutral grey** to **luminous cyan**, signaling that the article is distilled, embedded, and indexed!

---

## Core Subsystems & Technical Deep-Dive

### 1. Content Extraction Pipeline

_Detailed specification: [`docs/content-pipeline.md`](./docs/content-pipeline.md)_

- **Security & Privacy Guardrails:** Rejects restricted browser schemes (`chrome://`, `chrome-extension://`, `edge://`, `about:`, `file://`) and sensitive domains (banking, password managers, authentication portals).
- **URL Canonicalization:** Strips tracking parameters (`utm_*`, `fbclid`, `gclid`), hash fragments, and trailing slashes to produce deterministic SHA-256 article IDs.
- **Cloned DOM Processing:** Clones `document.cloneNode(true)` and parses via `@mozilla/readability`. Sanitizes with `DOMPurify` to eradicate scripts, styles, iframes, and tracking beacons, then converts clean semantic HTML to readable Markdown via `turndown`.
- **Token-Safe Chunking:** Plain text is segmented into ~150–180 word passages with 20–30 word sliding overlap, strictly respecting sentence and paragraph boundaries to prevent context fragmentation.

### 2. On-Device Neural Embedding Pipeline

_Detailed specification: [`docs/embedding-pipeline.md`](./docs/embedding-pipeline.md)_

- **Transformer Architecture:** Runs `Xenova/all-MiniLM-L6-v2` (6 layers, 384 dimensions, 256 max tokens) via `@huggingface/transformers` inside the Offscreen Document.
- **WebGPU Probe & WASM Fallback:** `hasUsableWebGpu()` probes `navigator.gpu.requestAdapter()` and `adapter.requestDevice()` to ensure the hardware device is genuinely usable before loading. If hardware is unavailable, it gracefully loads local ONNX WASM SIMD without poisoning the loader promise chain.
- **Local Asset Bundling:** All ONNX WASM binaries and loaders (`ort-wasm*`) are bundled under `ort/` via `wxt.config.ts`, ensuring strict compliance with Chrome MV3 CSP forbidding remote code execution.
- **Cache API Model Weights:** Model weights (~23 MB) are downloaded once from Hugging Face on the first save and cached in the browser's origin `Cache API` for permanent offline use.

### 3. Hybrid Vector + Lexical Search

_Detailed specification: [`docs/hybrid-search.md`](./docs/hybrid-search.md)_

- **Convex Combination Formula:** Scores each chunk using:
  $$\text{Score} = \alpha \cdot \text{CosineDense} + (1 - \alpha) \cdot \text{BM25Lexical}$$
- **Optimized Math:** Because embeddings are unit-normalized ($L_2$ norm = 1.0), cosine similarity simplifies directly to a fast dot product $\mathbf{u} \cdot \mathbf{v}$.
- **Chunk-to-Article Aggregation:** Scores every individual chunk, identifies the highest-scoring passage for each article to serve as the dynamic search result snippet, and ranks articles in descending order.

### 4. 3NF Relational + Vector Storage Engine

_Detailed specification: [`docs/storage-engine.md`](./docs/storage-engine.md)_

- **Third Normal Form (3NF) Partitioning:**
  - `articles`: Lightweight metadata for fast 60 FPS UI list rendering and filtering.
  - `article_contents`: 1:1 vertical partition storing heavy plain text and Markdown.
  - `chunks`: 1:N child store holding text passages and 384-dimensional `Float32Array` vectors indexed by `by_articleId`.
- **Atomic Cascading Deletions:** Single IndexedDB transactions atomically delete article metadata, full text, and vector chunks, guaranteeing zero orphaned vector records.
- **Logical Footprint Estimator:** Tracks exact logical payload bytes across articles and vectors, ensuring LevelDB write-ahead logs (WAL) and SSTable directory overhead do not skew user quota readings.

### 5. Side Panel & Knowledge Manager UI

_Detailed specification: [`docs/ui-and-export-architecture.md`](./docs/ui-and-export-architecture.md)_

- **Side Panel (`sidepanel.html`):** Persistent companion interface featuring active tab recognition, instant search with snippet highlights, reading time estimates, domain filtering pills, and quota telemetry.
- **Knowledge Manager (`options.html`):** Full-screen table with multi-select bulk operations, reader view modal, age-based cleanup drawer (delete unstarred articles older than 30/60/90 days), and quota governance.
- **Portability:** Export your Second Brain into a zip archive structured as `YYYY-MM-DD-title.md` with YAML frontmatter or export raw JSON.

### 6. Manifest V3 Lifecycle & Action Topology

_Detailed specification: [`docs/wxt-mv3-architecture.md`](./docs/wxt-mv3-architecture.md)_

- **Service Worker Lifecycle:** Purely event-driven; sleeps after ~30 seconds of inactivity to minimize memory footprint.
- **Action Behavior:** Uses `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` for native toggle behavior.
- **Dynamic Icon Sync:** Listens to `chrome.tabs.onActivated` and `chrome.tabs.onUpdated` to sync active/inactive Knowledge Graph icons in real time.

---

## Manifest V3 Entrypoints & IPC Contracts

### Entrypoints Overview

| Entrypoint       | Process Realm      | DOM Access        | Purpose                                                                   |
| :--------------- | :----------------- | :---------------- | :------------------------------------------------------------------------ |
| **`background`** | Service Worker     | None              | Event routing, keyboard shortcuts, tab badge sync, quota gatekeeper       |
| **`content`**    | Webpage Tab        | Cloned DOM        | Non-destructive Readability distillation, Markdown conversion, chunking   |
| **`offscreen`**  | Offscreen Document | Full DOM & WebGPU | Neural embedding generation (`all-MiniLM-L6-v2`), hybrid search execution |
| **`sidepanel`**  | Extension Renderer | React 19 UI       | Persistent reading companion, search interface, active tab banner         |
| **`options`**    | Extension Tab      | React 19 UI       | Full-screen knowledge manager, bulk cleanup, disk quota settings, export  |

### Inter-Process Communication (IPC) Protocol

All internal communication uses typed messages via `chrome.runtime.sendMessage`:

| Message Type              | Direction                 | Payload                           | Description                                                         |
| :------------------------ | :------------------------ | :-------------------------------- | :------------------------------------------------------------------ |
| `SAVE_ACTIVE_TAB`         | Side Panel → Background   | _None_                            | Initiates ingestion for the current active tab                      |
| `CHECK_TAB_STATUS`        | UI → Background           | `{ url: string }`                 | Queries whether a given URL is already saved in IndexedDB           |
| `EXTRACT_PAGE`            | Background → Content      | _None_                            | Commands content script to extract, distill, and chunk page content |
| `GENERATE_EMBEDDINGS_JOB` | Background → Offscreen    | `{ articleId, textChunks }`       | Offloads text chunks to Offscreen Document for vector embedding     |
| `ARTICLE_INDEXED`         | Offscreen → Background/UI | `{ articleId, url }`              | Emitted when all vector chunks are persisted to IndexedDB           |
| `SEARCH_QUERY`            | Side Panel → Offscreen    | `{ query, topK, ... }`            | Executes hybrid dense + lexical search over all IndexedDB chunks    |
| `SEARCH_RESULTS`          | Offscreen → Side Panel    | `{ results: SearchResultItem[] }` | Returns ranked articles with best matching passage snippets         |
| `FIND_RELATED_ARTICLES`   | Side Panel → Offscreen    | `{ text, excludeArticleId }`      | Finds top-k semantically related articles based on text content     |
| `STORAGE_QUOTA_EXCEEDED`  | Background → Side Panel   | `{ currentUsageBytes, ... }`      | Triggers Storage Limit Reached modal when quota is exceeded         |
| `UPDATE_STORAGE_CAP`      | UI → Background           | `{ newMaxStorageBytes }`          | Updates user storage budget cap in `chrome.storage.local`           |
| `DATABASE_UPDATED`        | Any → All                 | `{ reason, articleId? }`          | Broadcasts cross-window data synchronization events                 |
| `DELETE_ARTICLES`         | Options → Background/DB   | `{ articleIds: string[] }`        | Cascading deletion of articles, contents, and vector chunks         |

---

## Scripts & Quality Verification

All quality checks and builds are managed via `pnpm` scripts:

| Command                                           | Action                                                                        |
| :------------------------------------------------ | :---------------------------------------------------------------------------- |
| `pnpm run dev`                                    | Start development server with live reload and Manifest V3 HMR                 |
| `pnpm run build`                                  | Compile and bundle production extension into `.output/chrome-mv3/`            |
| `pnpm run zip`                                    | Package production extension into `.output/*.zip` for Web Store submission    |
| `pnpm run typecheck`                              | Run WXT type preparation and execute strict TypeScript check (`tsc --noEmit`) |
| `pnpm test`                                       | Run entire unit and component test suite via Vitest (14 files, 128 tests)     |
| `pnpm run test:watch`                             | Run Vitest in interactive watch mode                                          |
| `pnpm run lint`                                   | Run Oxlint fast linter across all project TypeScript and React files          |
| `pnpm run lint:fix`                               | Run Oxlint and automatically fix lint issues                                  |
| `pnpm run format`                                 | Format all source code, tests, markdown, and config files via Prettier        |
| `pnpm run format:check`                           | Verify code formatting compliance with Prettier rules                         |
| `bash .agents/skills/qa-verify/scripts/verify.sh` | Run all 5 QA gates (format check, lint, typecheck, tests, build)              |

---

## Security, Privacy & Compliance Model

1. **100% Local-First / Zero Telemetry:**
   - No user data, URLs, article contents, or vector embeddings are ever transmitted to external servers.
   - The only network request occurs on the first run to download model weights from Hugging Face, which are subsequently cached offline in the browser's `Cache API`.
2. **Content Security Policy (CSP):**
   - Manifest V3 forbids remote code execution (`'unsafe-eval'`).
   - The manifest explicitly configures `script-src 'self' 'wasm-unsafe-eval'; object-src 'self';`, allowing local WebAssembly compilation while strictly prohibiting arbitrary JavaScript injection.
3. **DOM Isolation & Sanitization:**
   - Content scripts execute inside an isolated execution realm, preventing host webpage scripts from tampering with extension variables.
   - All extracted HTML passes through `DOMPurify` before conversion to Markdown, stripping all executable tags, scripts, and trackers.
4. **Transparent User Storage Consent:**
   - Employs a conservative default storage cap of `50 MB`.
   - Never requests elevated disk access or consumes system storage without displaying a user confirmation modal.
   - Physical disk space guardrail automatically halts saves if host machine free disk drops below `500 MB`.
5. **Host Permissions & Side Panel Gesture Isolation:**
   - Manifest V3 restricts `activeTab` to direct gestures on the extension toolbar action icon or context menu. Because the Side Panel is an extension document, user clicks inside the Side Panel do not grant an `activeTab` gesture to the host webpage.
   - Declarative and dynamic script injection (`chrome.scripting.executeScript` fallback for tabs opened before extension reload/installation) uses `host_permissions: ['http://*/*', 'https://*/*']` to guarantee reliable content extraction across all standard web pages without requiring manual page reloads.
