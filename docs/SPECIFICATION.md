# Project Specification: `chrome-rag-knowledge-base-extension`

> **Document Version:** 1.0.0-draft  
> **Target Platform:** Google Chrome (Manifest V3)  
> **Primary Architecture:** Local-First In-Browser Retrieval-Augmented Generation (RAG) & Semantic Knowledge Assistant  

---

## 1. Executive Summary & Vision

`chrome-rag-knowledge-base-extension` is a privacy-first, on-device Chrome extension that turns the user's browser into an intelligent personal knowledge assistant. Instead of relying on static bookmark folders or shallow browser history, the extension captures article content, processes it through an on-device neural embedding model, and enables semantic concept search and contextual recall directly within Chrome's native Side Panel.

All machine learning inference and data storage happen **100% locally on the user's machine** using WebGPU/WASM and IndexedDB. No page content, search queries, or vector embeddings are transmitted to external servers.

---

## 2. Core Problem & Product Goals

### 2.1 The Problem
1. **Keyword Search Failure:** Traditional browser history and bookmarks require exact keyword matches (lexical search). Users frequently remember the *concept* or *solution* of an article (e.g., "how to fix Go race condition on maps") but cannot recall the exact title or specific words used by the author (e.g., "sync.Mutex").
2. **High Friction in Bookmarking:** Organizing bookmark folders requires manual effort that users abandon over time.
3. **Data Privacy & Cloud Lock-in:** Existing AI "second brain" services require uploading full browsing history and confidential work documents to cloud servers, introducing security vulnerabilities and recurring subscription costs.
4. **Information Noise:** Full-page archiving tools (like earlier iterations of Memex) ingest navigation bars, cookie banners, tracking scripts, and ads, bloating databases and generating noisy search results.

### 2.2 Primary Goals
* **True Semantic Retrieval:** Allow users to search by natural language intent, questions, and conceptual descriptions using dense vector representations (Cosine Similarity).
* **High-Signal Content Distillation:** Strip extraneous DOM boilerplate using Mozilla's Readability engine before text chunking.
* **Zero Operational Cost & Privacy:** Run embeddings and vector storage on-device at $0 marginal cost with complete offline capability.
* **Deterministic Data Control:** Maintain clear parent-child relational mapping so users have full visibility, exportability, and cascading deletion control over stored articles.
* **Extensible RAG Foundation:** Implement a modular architecture that supports full natural language question-answering via on-device LLMs (e.g., Chrome Built-in Prompt API / Gemini Nano).

---

## 3. System Architecture & Building Blocks

The extension follows Manifest V3 specifications, dividing responsibilities among isolated contexts:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CHROME BROWSER CONTEXT                          │
│                                                                        │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │   Active Web Page     │             │     Chrome Side Panel      │  │
│  │   (Content Script)    │             │   (React + Tailwind UI)    │  │
│  │  - Readability parse  │             │  - Search input            │  │
│  │  - Text chunking      │             │  - Article library feed    │  │
│  │  - In-page highlight  │             │  - Contextual active tab   │  │
│  └──────────┬────────────┘             └─────────────▲──────────────┘  │
│             │                                        │                 │
│             │ chrome.runtime                         │ chrome.runtime  │
│             │ .sendMessage                           │ .sendMessage    │
│             ▼                                        ▼                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │               Background Service Worker (Coordinator)            │  │
│  │  - Tab lifecycle & badge updates (chrome.tabs / onActivated)     │  │
│  │  - Offscreen document lifecycle management                       │  │
│  │  - Job queue orchestration                                       │  │
│  └───────────────────┬───────────────────────────────▲──────────────┘  │
│                      │                               │                 │
│                      ▼                               │                 │
│  ┌───────────────────────────────────────┐           │                 │
│  │      Offscreen Document (AI Engine)   │           │                 │
│  │  - @xenova/transformers               │           │                 │
│  │  - all-MiniLM-L6-v2 ONNX              │           │                 │
│  │  - WebGPU / WASM SIMD acceleration    │           │                 │
│  └───────────────────┬───────────────────┘           │                 │
│                      │                               │                 │
│                      ▼                               │                 │
│  ┌───────────────────────────────────────────────────┴──────────────┐  │
│  │                    IndexedDB Storage (idb)                       │  │
│  │  - 'articles' Store: Metadata, title, URL, timestamp             │  │
│  │  - 'chunks' Store: Text excerpts, Float32Array vector embeddings │  │
│  │  - 'by_articleId' Index: Cascading deterministic cleanup         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Content Script (`src/contentScript`)
* **Role:** Extracts article content from active tabs.
* **Mechanisms:**
  * Uses `@mozilla/readability` to isolate article title, author, text body, and publication metadata.
  * Sanitizes DOM using `DOMPurify`.
  * Implements recursive text chunking: splits long text into ~250–300 word chunks with a 50-word sliding window overlap to maintain context across boundaries.
  * Implements CSS highlight / deep-scroll anchor (`window.find` or CSS Custom Highlight API) when a user clicks a search snippet in the Side Panel.

### 3.2 Background Service Worker (`src/background`)
* **Role:** Central message dispatcher and lifecycle orchestrator.
* **Mechanisms:**
  * Monitors active tabs via `chrome.tabs.onActivated` and `chrome.tabs.onUpdated` to update the extension icon badge (e.g., green checkmark if current URL is indexed).
  * Manages the ephemeral lifecycle of the Offscreen Document (`chrome.offscreen.createDocument` / `chrome.offscreen.closeDocument`).
  * Persists pending jobs in `chrome.storage.session` so work is not lost when the service worker becomes idle.

### 3.3 Offscreen Document (`src/offscreen`)
* **Role:** Dedicated machine learning worker.
* **Mechanisms:**
  * Runs `@xenova/transformers` with `all-MiniLM-L6-v2` (~23MB quantized model).
  * Executes feature-extraction pipelines to transform raw text strings into normalized 384-dimensional `Float32Array` embeddings.
  * Uses WebGPU hardware acceleration with automatic WebAssembly SIMD fallback.
  * Model files are cached in the browser's Cache Storage API after first load for instant offline execution.

### 3.4 Storage & Search Engine (`src/db`)
* **Role:** Relational vector store in IndexedDB via `idb`.
* **Mechanisms:**
  * Maintains two connected object stores: `articles` and `chunks`.
  * Computes **Cosine Similarity** (`dotProduct(queryVec, docVec)`) directly across typed arrays in JavaScript (benchmarking <10ms for 10,000 vectors).
  * Performs cascading deletes: removing an article immediately removes all associated child chunks via the `by_articleId` index without orphaned vectors.

### 3.5 Side Panel User Interface (`src/sidepanel`)
* **Role:** Persistent companion interface built with React and Tailwind CSS.
* **Modes:**
  * **Library Mode (Default):** Chronological cards of all saved articles, domain filters, tags, read times, and manual deletion/export controls.
  * **Contextual Active Tab:** Proactively displays if the active page is saved and surfaces past related reading.
  * **Semantic Search Mode:** Natural-language search bar displaying scored matching snippets with highlighted matching concepts and 1-click jump links.

---

## 4. Technology Stack & Dependencies

| Area | Package / API | Purpose |
| :--- | :--- | :--- |
| **Platform** | Manifest V3 | Standard Chrome extension platform APIs (`sidePanel`, `offscreen`, `storage`, `tabs`, `scripting`) |
| **Build & Language** | TypeScript + Vite + `@crxjs/vite-plugin` | Modern development environment with Hot Module Replacement (HMR) and strict typing |
| **UI Framework** | React 18 / 19 + Tailwind CSS | Fast, lightweight reactive component UI for the Side Panel and Options page |
| **Icons** | `lucide-react` | Clean UI icons for search, star, trash, external links, and status badges |
| **Content Extraction** | `@mozilla/readability` + `DOMPurify` | Robust article distillation engine and XSS protection |
| **Embedding Engine** | `@xenova/transformers` | Client-side ONNX runtime for `Xenova/all-MiniLM-L6-v2` |
| **Storage Layer** | `idb` (IndexedDB) | High-capacity async client database for articles, chunks, and vector embeddings |
| **LLM Synthesis (Optional RAG)** | Chrome Prompt API (`window.ai` / Gemini Nano) | On-device question answering over retrieved chunks |

---

## 5. Core User Flows

### Flow 1: Saving / Ingesting an Article
1. User browses to an article or documentation page.
2. User clicks the **"Remember"** button in the Side Panel (or presses `Alt + S`).
3. Content script executes Readability, cleans text, and partitions it into overlapping chunks.
4. Extracted chunks are routed through the Background Worker to the Offscreen Document.
5. The Offscreen Document generates 384-dimensional embeddings for each chunk.
6. The article record and embedded chunks are saved atomically to IndexedDB.
7. The extension toolbar icon updates with a saved badge indicator (`✓`).

### Flow 2: Semantic Concept Search
1. User opens the Side Panel and types a conceptual query (e.g., *"handling concurrent writes in database"*).
2. The query is sent to the Offscreen Document to produce a single 384-dimensional query vector.
3. IndexedDB chunks are scanned, computing Cosine Similarity against the query vector.
4. Top-$K$ chunks exceeding a similarity threshold (e.g., $> 0.65$) are grouped by parent `articleId`.
5. The Side Panel displays the parent articles with the most relevant excerpt highlighted.
6. Clicking a snippet opens the tab (or focuses the existing tab) and scrolls to the highlighted passage.

### Flow 3: Deterministic Cleanup & Deletion
1. User clicks the trash icon on an article card in the Side Panel.
2. An IndexedDB transaction opens on both `articles` and `chunks`.
3. The article is deleted from `articles`.
4. All associated child chunks are located via the `by_articleId` index and deleted in the same transaction.
5. Storage counters update immediately.

---

## 6. Data Contracts & Schemas

### 6.1 Database Schema (IndexedDB)

```typescript
// Store: 'articles'
export interface ArticleRecord {
  id: string;              // Unique hash (e.g. SHA-256 of canonical URL)
  url: string;            // Canonical page URL
  title: string;          // Extracted article title
  byline?: string;        // Author / Publication
  excerpt?: string;       // Short summary / leading paragraph
  siteName?: string;      // Domain or publication name (e.g., "go.dev")
  savedAt: number;        // Epoch timestamp (ms)
  readingTimeMinutes: number;
  chunkCount: number;
  isStarred: boolean;
  fullText: string;       // Pristine distilled text/markdown body (used for export & full previews)
}

// Store: 'chunks'
export interface ChunkRecord {
  id: string;              // `${articleId}_chunk_${chunkIndex}`
  articleId: string;       // Foreign key -> ArticleRecord.id (Indexed: 'by_articleId')
  chunkIndex: number;      // 0-indexed position within the document
  text: string;           // Sliding-window excerpt (~250 words, used for vector search & snippets)
  vector: number[];       // 384-dimensional dense embedding array
}
```

### 6.2 Internal Messaging Protocol (`chrome.runtime.sendMessage`)

```typescript
export type ExtensionMessage =
  | { type: 'INDEX_CURRENT_TAB' }
  | { type: 'INDEX_PAGE_DATA'; payload: { article: Omit<ArticleRecord, 'chunkCount'>; textChunks: string[] } }
  | { type: 'GENERATE_EMBEDDINGS'; payload: { textChunks: string[] } }
  | { type: 'EMBEDDINGS_GENERATED'; payload: { embeddings: number[][] } }
  | { type: 'SEARCH_QUERY'; payload: { query: string; topK?: number } }
  | { type: 'SEARCH_RESULTS'; payload: { results: Array<{ article: ArticleRecord; bestSnippet: string; score: number }> } }
  | { type: 'DELETE_ARTICLE'; payload: { articleId: string } }
  | { type: 'CHECK_TAB_STATUS'; payload: { url: string } };
```

---

## 7. Phased Implementation Roadmap for Agents

* **Phase 1: Project Scaffolding & Manifest V3 Baseline**
  * Initialize Vite with `@crxjs/vite-plugin`, TypeScript, React, and Tailwind CSS.
  * Define `manifest.json` with permissions (`sidePanel`, `offscreen`, `storage`, `activeTab`, `scripting`).
  * Establish baseline Side Panel shell with open/close state.
* **Phase 2: Content Script & Readability Pipeline**
  * Integrate `@mozilla/readability` and `DOMPurify` inside `src/contentScript`.
  * Implement sliding-window text chunker with unit tests.
  * Establish messaging flow from Content Script to Background Worker.
* **Phase 3: Offscreen Document & Transformers.js Integration**
  * Set up `offscreen.html` and `offscreen.ts`.
  * Load and cache `Xenova/all-MiniLM-L6-v2`.
  * Validate WebGPU / WASM execution and measure embedding generation latency.
* **Phase 4: IndexedDB Storage & Vector Search Math**
  * Implement `src/db` using `idb` with `articles` and `chunks` stores and `by_articleId` index.
  * Write typed Cosine Similarity search function.
  * Implement atomic cascading deletion and storage usage estimation via `navigator.storage.estimate`.
* **Phase 5: Side Panel UI & Tab Sync**
  * Build React components: `SearchBar`, `ArticleCard`, `SnippetView`, `LibraryFeed`, and `SettingsModal`.
  * Implement active tab synchronization (`chrome.tabs.onActivated`) to reflect live saved status.
* **Phase 6: In-Page Highlighting & Full RAG Polish**
  * Implement click-to-scroll and DOM highlighting on the target web page.
  * Add optional synthesis hook using Chrome Built-in Prompt API (`window.ai`).
  * End-to-end performance and memory audit across 100+ saved articles.
