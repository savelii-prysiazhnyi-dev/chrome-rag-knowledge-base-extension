# Project Specification: `chrome-rag-knowledge-base-extension`

> **Document Version:** 1.2.0  
> **Target Platform:** Google Chrome (Manifest V3)  
> **Primary Architecture:** Local-First In-Browser Retrieval-Augmented Generation (RAG) & Semantic Knowledge Assistant  

---

## 1. Executive Summary & Vision

`chrome-rag-knowledge-base-extension` is a privacy-first, on-device Chrome extension that turns the user's browser into an intelligent personal knowledge assistant ("Second Brain"). Instead of relying on static bookmark folders or shallow browser history, the user explicitly saves articles they care about with a single click (`Remember` / `Alt + S`). The extension distills the article content, processes it through an on-device neural embedding model, and enables semantic concept search, proactive contextual recall, and local RAG question-answering directly within Chrome's native Side Panel.

All machine learning inference and data storage happen **100% locally on the user's machine** using WebGPU/WASM and IndexedDB. No page content, search queries, or vector embeddings are ever transmitted to external servers, and users retain strict control over both their data (via Markdown/JSON exports) and how much disk space the extension is permitted to use.

---

## 2. Core Problem & Product Goals

### 2.1 The Problem
1. **Keyword Search Failure:** Traditional browser history and bookmarks require exact keyword matches (lexical search). Users frequently remember the *concept* or *solution* of an article (e.g., "how to prevent Go race condition on maps") but cannot recall the exact title or specific words used by the author (e.g., `sync.RWMutex`).
2. **High Friction in Bookmarking:** Organizing bookmark folders requires manual effort that users abandon over time.
3. **Data Privacy & Cloud Lock-in:** Existing AI "second brain" services require uploading browsing history and confidential work documents to cloud servers, introducing security risks, vendor lock-in, and recurring subscription costs.
4. **Information Noise & Unbounded Storage Bloat:** Full-page archiving tools ingest navigation bars, cookie banners, tracking scripts, and ads—and silently consume gigabytes of disk space without explicit user consent.

### 2.2 Primary Goals
* **Intentional, High-Signal Curation:** Only index pages the user explicitly chooses to save, stripping extraneous DOM boilerplate via Mozilla's Readability engine on a cloned DOM before text chunking.
* **Hybrid Semantic & Lexical Retrieval:** Allow users to search by natural language intent and conceptual descriptions using dense vector representations (Cosine Similarity) blended with lightweight keyword/BM25 matching for exact technical identifiers.
* **Zero Operational Cost & 100% Privacy:** Run embeddings, vector storage, and optional LLM synthesis on-device at $0 marginal cost with complete offline capability.
* **Strict User-Controlled Storage & Data Ownership:** Enforce an explicit, user-approved storage budget (defaulting to a compact 50 MB baseline cap) that prompts the user before consuming additional disk space, backed by cascading deletions and full `.zip` (Markdown) / `.json` export.
* **Contextual Companion & RAG Synthesis:** Proactively surface whether the active tab is already saved alongside related past reading, support 1-click deep linking with in-page text highlighting, and provide optional natural-language Q&A via Chrome's built-in Prompt API (Gemini Nano) or WebLLM.

---

## 3. Feature Specifications

### 3.1 Data Ownership & User-Controlled Storage Quota
* **Exporting Data:** An **"Export Knowledge Base"** action in Settings / Knowledge Manager that exports all saved articles, metadata, and notes either as:
  * A `.zip` archive of clean Markdown (`.md`) files with YAML frontmatter (`title`, `url`, `savedAt`, `siteName`, `byline`, `isStarred`).
  * A structured `.json` backup for full database restoration.
* **Tiered Storage Budget & Explicit Disk Allocation:**
  * **Baseline IndexedDB Cap (Default `50 MB`):** By default, the extension operates within a strict `50 MB` application-enforced IndexedDB quota (~1,000–1,500 articles including vectors and Markdown) and does **not** request unrestricted disk access on install (`unlimitedStorage` is kept as an optional permission).
  * **Near-Full / Quota Exceeded Prompt:** When IndexedDB usage reaches **85% of the current budget** (warning banner) or **100% during a save attempt** (blocking modal), the extension pauses and prompts the user with two choices:
    1. **Allocate More Disk Space:** The user can authorize the extension to use a specific maximum amount of disk space (pre-filled with a sensible default such as **`250 MB`**, or customizable via input/presets like `100 MB`, `250 MB`, `500 MB`, `1 GB`). If the user expands beyond Chrome's standard extension quota, the extension requests the optional `unlimitedStorage` permission while strictly enforcing the user's chosen MB cap.
    2. **Clean Up Existing Articles:** Keep the current storage limit and open the cleanup view to remove older unstarred articles or bulk-delete by domain.
* **Live Storage Dashboard:** Visual progress meter in the Side Panel and Knowledge Manager showing exact usage against the user's approved cap (e.g., *"Using 42.1 MB of your 50 MB limit (120 GB free on disk)"*) powered by `navigator.storage.estimate()`.
* **Low Physical Disk Safety Guardrail:** If the user's physical hard drive has less than **500 MB** of free space (`quota - usage < 500 MB`), the extension displays a critical low-disk warning banner and blocks quota expansion.
* **Bulk Cleanup Tools & Starred Protection:**
  * One-click actions in the Knowledge Manager: *"Delete unstarred articles older than 60 / 90 days"* or *"Delete all unstarred articles from domain..."*.
  * **Starred Protection:** Starred/pinned articles (`isStarred: true`) are protected from bulk age/domain cleanup tools unless explicitly selected by the user.

### 3.2 Active Browsing & Contextual Features
* **Toolbar Icon Badges:** The extension action icon dynamically displays a green checkmark badge (`✓`) whenever the active tab's canonical URL exists in the `articles` store.
* **Contextual Side Panel Banner:** When browsing an already-saved page, the top of the Side Panel renders a contextual status bar:
  * `🟢 Saved to your Second Brain on Oct 14 • [Update] [Remove]`
  * Clicking **[Update]** re-extracts the page, replaces its content and chunks atomically in IndexedDB, and preserves `isStarred` and original creation metadata.
* **Related Past Reading:** When reading a page, the Side Panel can compute an embedding of the current page's title + lead excerpt and surface top related articles from the user's local database.

### 3.3 Search & In-Page Deep Linking
* **Hybrid Semantic Vector Search:** Searches by meaning, intent, or vague recollections (e.g., *"prevent Go race condition"*) by combining dense Cosine Similarity from the embedding model with lexical token matching (Reciprocal Rank Fusion / keyword boost) so both conceptual queries and exact identifiers (e.g., `sync.Mutex`, error codes) rank accurately.
* **Click-to-Jump & In-Page Highlighting:** Clicking a search result snippet in the Side Panel opens the target URL (or focuses the existing tab), scrolls smoothly to the matching passage, and highlights the matched text in yellow using the **CSS Custom Highlight API** (`CSS.highlights`) with a `window.find()` / DOM TreeWalker fallback.

### 3.4 Organization & Exploration (Library View)
* **Default Reading Feed:** When the search bar is empty, the Side Panel displays a reverse-chronological list of saved article cards featuring titles, favicons, source domain, estimated reading time, save date, and star/delete actions.
* **Domain Filter Pills:** Aggregated quick-filter chips at the top of the library (e.g., `github.com (38)`, `stackoverflow.com (24)`, `react.dev (12)`).
* **Starred / Favorites Filter:** One-click toggle to filter exclusively for pinned/starred articles.
* **Full-Screen Knowledge Manager:** A dedicated full-tab Options/Manager page (`options.html`) providing a high-density searchable table view, column sorting (by date, domain, reading time), domain filters, storage quota configuration, export controls, and multi-select checkboxes for batch deletion or starring.

### 3.5 Ingestion Guardrails & Noise Filtering
* **Explicit 1-Click "Remember" Action:** Pages are **never** saved automatically in the background. Users explicitly trigger ingestion via the **"Remember"** button in the Side Panel or the `Alt + S` keyboard shortcut (`commands` API in `manifest.json`).
* **Readability Distillation (Non-Destructive):** Clones the active document (`document.cloneNode(true)`) so the live page is never mutated, runs `@mozilla/readability` to strip ads, navbars, sidebars, cookie banners, and footers, and converts the sanitized HTML (`DOMPurify` + `turndown`) into clean Markdown (for export/reader view) and plain text (for chunking).
* **Domain Blocklist & Incognito Protection:**
  * Disabled in Incognito windows (`tab.incognito === true`) by default.
  * Ignores non-HTTP(S) schemes (`chrome://`, `file://`, `about:`).
  * Warns the user before saving if the current URL matches a customizable sensitive-domain blocklist (e.g., banking sites, `mail.google.com`, authentication/checkout paths like `/login`, `/checkout`).

### 3.6 Full RAG Question Answering (Optional Synthesis)
* **On-Device Q&A:** When a user prefixes a query with `?` or switches to **"Ask AI"** mode, the top-$K$ retrieved chunks are formatted into a grounded prompt and passed to Chrome's built-in **Prompt API (`window.ai` / `LanguageModel` - Gemini Nano)** (or an optional WebLLM fallback), streaming a synthesized answer with inline citations `[1]`, `[2]` linking directly to the source snippets.

---

## 4. System Architecture & Building Blocks

The extension follows Manifest V3 specifications, dividing responsibilities across isolated execution contexts while leveraging the **shared `chrome-extension://<id>` IndexedDB origin** across the Background Service Worker, Offscreen Document, Side Panel, and Options page to avoid serializing large vector arrays over IPC:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          CHROME BROWSER CONTEXT                            │
│                                                                            │
│  ┌─────────────────────────┐             ┌──────────────────────────────┐  │
│  │     Active Web Page     │             │  Side Panel & Options UI     │  │
│  │    (Content Script)     │             │     (React + Tailwind)       │  │
│  │  - DOM clone + Readability            │  - Library & Domain Filters  │  │
│  │  - Markdown conversion  │             │  - Contextual Active Banner  │  │
│  │  - Text chunking        │             │  - Search & RAG Q&A (Nano)   │  │
│  │  - CSS Highlight scroll │             │  - Quota Modal & ZIP Export  │  │
│  └────────────┬────────────┘             └──────┬────────────────▲──────┘  │
│               │                                 │                │         │
│               │ chrome.runtime                  │ Control IPC    │ Direct  │
│               │ .sendMessage                    ▼                │ IDB     │
│               ▼                                                  │ Reads   │
│  ┌──────────────────────────────────────────────────────────┐    │         │
│  │           Background Service Worker (Coordinator)        │    │         │
│  │  - Tab lifecycle & ✓ badge updates (tabs.onActivated)    │    │         │
│  │  - Storage quota gatekeeper (checks usage vs user cap)   │    │         │
│  │  - Offscreen Document singleton lifecycle management     │    │         │
│  └────────────────────────┬─────────────────────────────────┘    │         │
│                           │                                      │         │
│                           │ Job Dispatch IPC                     │         │
│                           ▼                                      │         │
│  ┌────────────────────────────────────────────┐                  │         │
│  │       Offscreen Document (AI Engine)       │                  │         │
│  │  - @huggingface/transformers (ONNX)        │                  │         │
│  │  - Embedding pipeline (384-d Float32Array) │                  │         │
│  │  - Hybrid Vector + Lexical Search Engine   │                  │         │
│  └────────────────────────┬───────────────────┘                  │         │
│                           │ Direct IDB Read/Write (Float32Array) │         │
│                           ▼                                      ▼         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                   Shared IndexedDB Storage (`idb`)                   │  │
│  │  - `articles` Store: Lightweight metadata, status, starred flag      │  │
│  │  - `article_contents` Store: Full clean text & Markdown (for export) │  │
│  │  - `chunks` Store: Text excerpts + binary `Float32Array` embeddings  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Content Script (`src/entrypoints/content`)
* **Role:** Distills article content when triggered by the user and handles in-page deep-link highlighting.
* **Mechanisms:**
  * Clones `document.cloneNode(true)` and runs `@mozilla/readability` to isolate article title, author, HTML body, plain text, and metadata without mutating the live page.
  * Sanitizes extracted HTML with `DOMPurify` and converts it to clean Markdown via `turndown` (used for `.md` exports).
  * **Token-Safe Recursive Chunking:** Splits article text along paragraph and sentence boundaries into **~150–180 word chunks (~750 characters)** with a **30-word sliding window overlap**. This guarantees chunks stay safely within the **256 WordPiece token limit** of `all-MiniLM-L6-v2` (even for code-heavy technical articles) without silent truncation.
  * **In-Page Highlighting:** Listens for `SCROLL_AND_HIGHLIGHT` messages, locates the target snippet in the DOM via text-node normalization / `CSS.highlights` (or `window.find` fallback), scrolls smoothly into view, and applies a yellow highlight style.

### 4.2 Background Service Worker (`src/entrypoints/background`)
* **Role:** Lightweight event coordinator, storage quota gatekeeper, and lifecycle manager.
* **Mechanisms:**
  * Evaluates URL canonicalization (stripping `utm_*`, `fbclid`, `#hash` fragments), incognito status, and sensitive-domain warnings.
  * **Storage Quota Gatekeeper:** Before accepting an `INDEX_PAGE_DATA` job, queries `navigator.storage.estimate()` and compares current IndexedDB usage + estimated payload size against the user's configured `maxStorageBytes` setting in `chrome.storage.local` (default `50 MB`). If exceeded, emits `STORAGE_QUOTA_EXCEEDED` to the Side Panel so the user can either raise the cap or clean up existing articles.
  * Monitors `chrome.tabs.onActivated` and `chrome.tabs.onUpdated` to check IndexedDB for the canonical URL and update the toolbar badge (`✓`).
  * Manages the Offscreen Document lifecycle (`chrome.offscreen.createDocument`) with a singleton mutex lock so concurrent requests never spawn duplicate offscreen contexts.

### 4.3 Offscreen Document (`src/entrypoints/offscreen`)
* **Role:** Dedicated ML inference and vector search worker.
* **Mechanisms:**
  * Runs `@huggingface/transformers` v3 with `Xenova/all-MiniLM-L6-v2` (or configurable 512-token `Snowflake/snowflake-arctic-embed-xs` / `BAAI/bge-small-en-v1.5`).
  * Configured with local ONNX WASM paths (`env.backends.onnx.wasm.wasmPaths`) to comply with Manifest V3 `wasm-unsafe-eval` CSP without external CDN requests.
  * Generates normalized 384-dimensional `Float32Array` embeddings via WebGPU with automatic WASM SIMD fallback.
  * Writes `Float32Array` vectors directly to IndexedDB and executes Hybrid Search (Cosine Similarity dot product + lexical BM25/token overlap score) directly against the shared IndexedDB `chunks` store.

### 4.4 Storage Layer (`src/db`)
* **Role:** Relational + Vector database built on IndexedDB (`idb`).
* **Mechanisms:**
  * Uses **three vertically partitioned object stores** (`articles`, `article_contents`, `chunks`) inside a single database:
    1. `articles`: Kept lightweight (~500 bytes/record) so loading thousands of cards in the Side Panel or Knowledge Manager is instantaneous.
    2. `article_contents`: Stores the full Markdown and plain text keyed by `articleId` (loaded only on demand during export, reader view, or re-indexing).
    3. `chunks`: Stores chunk text and native binary `Float32Array` embeddings indexed by `by_articleId`.
  * Enforces atomic multi-store ACID transactions (`readwrite` across `['articles', 'article_contents', 'chunks']`) for ingestion, updates, and cascading deletes.

### 4.5 Side Panel & Options UI (`src/entrypoints/sidepanel`, `src/entrypoints/options`)
* **Role:** Reactive user interfaces built with React and Tailwind CSS.
* **Side Panel Modes:**
  * **Contextual Active Tab Banner:** Shows live saved status (`Saved on <date> • [Update] [Remove]`) or a 1-click **"Remember"** CTA, plus **"Related Past Reading"** cards.
  * **Storage Quota Prompt Modal:** Appears when IndexedDB usage reaches 85% (warning) or 100% (blocking) of the user-approved limit, offering a 1-click disk allocation input (defaulting to `+200 MB` / `250 MB total`) or a shortcut to cleanup tools.
  * **Library Mode (Default):** Reverse-chronological feed, domain filter pills with article counts, and Starred toggle.
  * **Semantic Search & Ask AI Mode:** Debounced hybrid search returning scored snippets with click-to-jump highlighting, plus an optional Gemini Nano (`window.ai`) synthesis box.
* **Full-Screen Knowledge Manager (`options.html`):**
  * Searchable, sortable data table with multi-select bulk actions, domain blocklist editor, storage budget slider/input, live storage meter, and `.zip` (Markdown) / `.json` export buttons.

---

## 5. Technology Stack & Dependencies

| Area | Package / API | Purpose |
| :--- | :--- | :--- |
| **Extension Framework** | **WXT (`wxt`)** + Vite + TypeScript | Modern Manifest V3 framework with first-class Side Panel, Offscreen, HMR, and auto-manifest generation |
| **UI Framework** | React 19 + Tailwind CSS | Fast, lightweight component UI for Side Panel and Full-Screen Knowledge Manager |
| **Icons** | `lucide-react` | UI icons for search, star, trash, filters, export, and status indicators |
| **Content Extraction** | `@mozilla/readability` + `DOMPurify` + `turndown` | Boilerplate removal, HTML sanitization, and clean Markdown conversion for export |
| **Embedding Engine** | `@huggingface/transformers` (v3) | Client-side ONNX Runtime Web (WebGPU + WASM SIMD) for 384-d embeddings |
| **Storage Layer** | `idb` (IndexedDB) + `chrome.storage.local` | Transactional storage for metadata, full Markdown text, `Float32Array` vectors, and quota settings |
| **Archive / Export** | `fflate` (or `jszip`) | Fast client-side `.zip` generation of Markdown files for Knowledge Base export |
| **LLM Synthesis (Optional)** | Chrome Built-in Prompt API (`window.ai` / `LanguageModel`) | Zero-cost on-device natural language Q&A over retrieved chunks |

### 5.1 Required Manifest V3 Configuration (`wxt.config.ts` / `manifest.json`)
* **Permissions:** `sidePanel`, `offscreen`, `storage`, `activeTab`, `tabs`, `scripting`.
* **Optional Permissions:** `unlimitedStorage` (only requested when the user explicitly opts to expand their storage cap beyond standard browser extension limits).
* **Content Security Policy:**
  ```json
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
  }
  ```

---

## 6. Core User Flows

### Flow 1: Explicitly Saving / Updating an Article (with Quota Check)
1. User clicks **"Remember"** (`Alt + S`) on an active web page.
2. Content script clones the DOM, runs Readability, converts the body to Markdown (`turndown`) and plain text, and splits the text into ~150–180 word overlapping chunks.
3. Content script sends `INDEX_PAGE_DATA` to the Background Service Worker.
4. **Storage Quota Check:** Background Service Worker checks `navigator.storage.estimate()` against the user's configured `maxStorageBytes` (default `50 MB`):
   * If `currentUsage + payloadBytes > maxStorageBytes`, the worker halts ingestion and dispatches `STORAGE_QUOTA_EXCEEDED` to the Side Panel. The user can either approve a higher disk limit (e.g., `250 MB`, retrying the save immediately) or open Cleanup Tools.
   * If within quota, the worker canonicalizes the URL, writes the initial `ArticleRecord` (`status: 'indexing'`) and `ArticleContentRecord` to IndexedDB, and dispatches `GENERATE_EMBEDDINGS_JOB` to the Offscreen Document.
5. Offscreen Document computes 384-dimensional `Float32Array` vectors for all chunks, writes the `ChunkRecord`s, and updates `ArticleRecord.status = 'indexed'` in a single atomic IndexedDB transaction.
6. Background Worker updates the tab's toolbar badge to `✓` and notifies the Side Panel to refresh.

### Flow 2: Hybrid Semantic Search & Click-to-Jump
1. User enters a query in the Side Panel (e.g., *"prevent Go race condition"*).
2. Side Panel sends `SEARCH_QUERY` to the Offscreen Document (via Background coordinator).
3. Offscreen Document embeds the query into a normalized `Float32Array(384)`.
4. Offscreen Document scans `chunks` in IndexedDB, computing a hybrid score:
   $$\text{Score} = \alpha \cdot \text{CosineSimilarity}(q, c) + (1 - \alpha) \cdot \text{LexicalMatch}(q, c)$$
   where $\alpha = 0.75$ and candidate matches require $\text{CosineSimilarity} \ge 0.35$.
5. Matching chunks are grouped by `articleId`, joined with `articles` metadata, and returned to the Side Panel.
6. User clicks a snippet -> Background opens/focuses the tab and sends `SCROLL_AND_HIGHLIGHT` to the Content Script -> Page scrolls smoothly to the paragraph and highlights it in yellow.

### Flow 3: Exporting the Knowledge Base
1. User clicks **"Export Markdown (.zip)"** or **"Export JSON"** in the Knowledge Manager.
2. A cursor iterates over `articles` and joins `article_contents` by `articleId`.
3. For Markdown export, each article is formatted with YAML frontmatter + `contentMarkdown` and compressed in-memory via `fflate` into a downloadable `second-brain-export-YYYY-MM-DD.zip`.

### Flow 4: Deterministic Cleanup & Bulk Deletion
1. **Single/Bulk Delete:** Deleting an article (or running bulk cleanup by domain or age on unstarred articles) opens a single `readwrite` transaction across `articles`, `article_contents`, and `chunks`, deleting the parent record, its full text, and all child chunks via the `by_articleId` index.
2. Storage telemetry updates immediately via `navigator.storage.estimate()`.

---

## 7. Data Contracts & Architectural Rationale

### 7.1 Database Schema (IndexedDB - 3rd Normal Form & Vertically Partitioned)

```typescript
// Store 1: 'articles' (Lightweight metadata for fast feeds, filters & badges)
// Indexes: 'by_url' (unique), 'by_siteName', 'by_savedAt', 'by_isStarred'
export interface ArticleRecord {
  id: string;                        // SHA-256 hash of canonical URL
  url: string;                       // Canonical page URL
  title: string;                     // Extracted article title
  byline?: string;                   // Author / publication
  excerpt: string;                   // Leading summary (~200 chars)
  siteName: string;                  // Domain name (e.g., "go.dev")
  faviconUrl?: string;               // Page favicon URL
  savedAt: number;                   // Epoch timestamp (ms)
  updatedAt: number;                 // Epoch timestamp (ms) of last re-index
  readingTimeMinutes: number;        // Estimated reading time
  isStarred: boolean;                // Pinned status (protected from bulk cleanup)
  status: 'indexing' | 'indexed' | 'failed'; // Async ingestion lifecycle state
}

// Store 2: 'article_contents' (1:1 vertical partition for heavy full text & export)
// KeyPath: 'articleId'
export interface ArticleContentRecord {
  articleId: string;                 // Foreign key -> ArticleRecord.id
  contentText: string;               // Clean plain text from Readability
  contentMarkdown: string;           // Clean Markdown for .zip export & reader view
}

// Store 3: 'chunks' (1:N child chunks + binary vector embeddings)
// KeyPath: 'id' | Index: 'by_articleId'
export interface ChunkRecord {
  id: string;                        // `${articleId}_chunk_${chunkIndex}`
  articleId: string;                 // Foreign key -> ArticleRecord.id
  chunkIndex: number;                // 0-indexed sequential order
  text: string;                      // ~150-180 word passage
  vector: Float32Array;              // 384-dimensional normalized binary vector (1,536 bytes)
}

// Settings stored in chrome.storage.local
export interface StorageSettings {
  maxStorageBytes: number;           // Default: 50 * 1024 * 1024 (50 MB)
  warnThresholdRatio: number;        // Default: 0.85 (warn at 85% full)
  hasGrantedDiskExpansion: boolean;  // True once user explicitly raises the cap
}
```

> **Note on 3NF & `chunkCount`:** `chunkCount` has been intentionally omitted from `ArticleRecord` to preserve Third Normal Form (3NF) and avoid update anomalies. When a chunk count is needed in the Knowledge Manager, it can be queried in $O(\log N)$ time via `db.countFromIndex('chunks', 'by_articleId', articleId)`.

### 7.2 Internal Messaging Protocol (`chrome.runtime.sendMessage`)

```typescript
export type ExtensionMessage =
  | { type: 'INDEX_CURRENT_TAB' }
  | {
      type: 'INDEX_PAGE_DATA';
      payload: {
        article: Omit<ArticleRecord, 'status'>;
        content: Omit<ArticleContentRecord, 'articleId'>;
        textChunks: string[];
      };
    }
  | {
      type: 'STORAGE_QUOTA_EXCEEDED';
      payload: {
        currentUsageBytes: number;
        maxStorageBytes: number;
        requiredBytes: number;
        suggestedNewCapBytes: number; // e.g., 250 * 1024 * 1024 (250 MB)
      };
    }
  | { type: 'UPDATE_STORAGE_CAP'; payload: { newMaxStorageBytes: number } }
  | { type: 'GENERATE_EMBEDDINGS_JOB'; payload: { articleId: string; textChunks: string[] } }
  | { type: 'ARTICLE_INDEXED'; payload: { articleId: string; url: string } }
  | { type: 'SEARCH_QUERY'; payload: { query: string; topK?: number; domainFilter?: string; starredOnly?: boolean } }
  | {
      type: 'SEARCH_RESULTS';
      payload: {
        results: Array<{
          article: ArticleRecord;
          bestSnippet: string;
          chunkIndex: number;
          score: number;
        }>;
      };
    }
  | { type: 'FIND_RELATED_ARTICLES'; payload: { text: string; excludeArticleId?: string; topK?: number } }
  | { type: 'SCROLL_AND_HIGHLIGHT'; payload: { snippet: string } }
  | { type: 'DELETE_ARTICLES'; payload: { articleIds: string[] } }
  | { type: 'CHECK_TAB_STATUS'; payload: { url: string } };
```

### 7.3 Architectural Decision Records (ADRs)

#### ADR 1: IndexedDB Storage Mechanics & Two-Layer User-Controlled Disk Quota
* **Context:** Chrome persists IndexedDB files inside the user's local browser profile directory so saved articles survive browser restarts. However, if an extension declares `"unlimitedStorage"` in `manifest.json` (or relies on Chrome's default origin pool of up to 60% of total disk space), IndexedDB can grow unchecked into gigabytes on disk without user consent.
* **Decision:** Enforce a **Two-Layer Storage Gatekeeper**:
  1. **Compact Baseline Cap (`50 MB`) & Optional Permission:** On install, `StorageSettings.maxStorageBytes` defaults to `50 MB` (~1,000–1,500 articles including vectors and Markdown), and `"unlimitedStorage"` is placed in `optional_permissions` rather than required `permissions`.
  2. **Explicit User Consent Before Using Additional Disk Space:** Before indexing any article, the Background Service Worker checks `navigator.storage.estimate()`. At **85% usage**, a non-intrusive warning banner is shown. At **100% usage**, saving pauses and prompts the user to either:
     * **Allocate Additional Disk Space:** Specify an explicit maximum disk budget (pre-filled with a `250 MB` default or user-customizable MB value), requesting Chrome's optional `unlimitedStorage` permission only when needed while enforcing the user's chosen cap in software.
     * **Clean Up Existing Articles:** Keep the current cap and remove older unstarred articles or bulk-delete by domain.

#### ADR 2: Vertical Partitioning for Full Article Text (`articles` vs. `article_contents`)
* **Context:** Supporting `.zip` (Markdown) and `.json` exports requires storing the full extracted text and Markdown of every article (~20–50 KB per article). However, IndexedDB does not support partial column projections (`SELECT id, title FROM articles`)—reading an object from a store deserializes the entire record into memory.
* **Decision:** Partition article data vertically across two 1:1 object stores:
  * `articles`: Stores only lightweight metadata (~500 bytes/record) so rendering thousands of cards in the Side Panel or Knowledge Manager takes `< 5ms` and ~1 MB of RAM.
  * `article_contents`: Stores `{ articleId, contentText, contentMarkdown }` and is queried on demand only during Knowledge Base export, full-text reader view, or re-chunking.

#### ADR 3: Combining Relational & Vector Storage in a Single IndexedDB
* **Context:** Server architectures typically split relational metadata (PostgreSQL) and vector embeddings (Qdrant/Milvus) because server workloads search tens of millions of vectors using in-memory HNSW graphs.
* **Decision:** Unify relational and vector storage inside a single IndexedDB database (`second_brain_db`):
  * **Relational Layer:** Implemented via Object Stores (`articles`, `article_contents`, `chunks`), B-tree secondary indexes (`by_articleId`, `by_url`, `by_siteName`, `by_savedAt`), and multi-store ACID transactions (`db.transaction(['articles', 'article_contents', 'chunks'], 'readwrite')`) for deterministic cascading deletes.
  * **Vector Layer:** IndexedDB's Structured Clone algorithm natively persists binary `Float32Array(384)` vectors (1,536 bytes per chunk) inside `chunks` records without JSON serialization overhead. At personal knowledge base scale (1,000–40,000 chunks), an in-memory/cursor `Float32Array` dot-product scan takes `4–10 ms`, followed by an $O(1)$ primary-key lookup (`db.get('articles', chunk.articleId)`) to join parent metadata.

#### ADR 4: WXT Framework Over `@crxjs/vite-plugin`
* **Context:** Both `@crxjs/vite-plugin` and `WXT` (`wxt.dev`) use Vite, Rollup, React, and TypeScript under the hood. However, `@crxjs` lags behind Vite 5/6 releases and requires manual Rollup input workarounds for Manifest V3 Offscreen Documents and Side Panels.
* **Decision:** Use **WXT (`wxt`)**, which provides first-class file-based entrypoints (`background`, `content`, `sidepanel`, `offscreen`, `options`), native HMR, automatic `manifest.json` generation, and clean static asset bundling for local ONNX Runtime `.wasm` binaries.

#### ADR 5: Strict Third Normal Form (3NF) & Omitting `chunkCount`
* **Context:** Storing `chunkCount` on `ArticleRecord` introduces a transitive/derived dependency (`COUNT(chunks WHERE articleId = article.id)`), violating 3NF and risking update anomalies during article re-indexing.
* **Decision:** Omit `chunkCount` from `ArticleRecord`. When chunk counts are displayed in the Knowledge Manager or inspection views, query the `by_articleId` B-tree index directly in $O(\log N)$ time via `db.countFromIndex('chunks', 'by_articleId', articleId)` without deserializing chunk records.

---

## 8. Phased Implementation Roadmap

* **Phase 1: Project Scaffolding & WXT Manifest V3 Setup**
  * Initialize WXT (`wxt`) with Vite, TypeScript, React 19, and Tailwind CSS.
  * Configure `wxt.config.ts` with `wasm-unsafe-eval` CSP, optional `unlimitedStorage` permission, `Alt + S` command shortcut, and entrypoints (`background`, `content`, `sidepanel`, `options`, `offscreen`).
* **Phase 2: IndexedDB Relational + Vector Store & Quota Gatekeeper (`src/db`)**
  * Implement `articles`, `article_contents`, and `chunks` stores using `idb`.
  * Implement atomic CRUD transactions, cascading deletes, bulk cleanup queries, and the user-controlled `maxStorageBytes` quota gatekeeper (`50 MB` default baseline).
* **Phase 3: Content Script, Readability Distillation & Guardrails**
  * Implement cloned-DOM `@mozilla/readability` + `DOMPurify` + `turndown` Markdown conversion.
  * Build token-safe recursive text chunker (~150–180 words, 30-word overlap) with unit tests.
  * Add incognito and sensitive-domain blocklist checks.
* **Phase 4: Offscreen Document & Transformers.js v3 Engine**
  * Integrate `@huggingface/transformers` with bundled ONNX WASM paths and `Xenova/all-MiniLM-L6-v2`.
  * Implement direct-to-IndexedDB `Float32Array` embedding persistence and Hybrid (Cosine + Lexical) search.
* **Phase 5: Side Panel UI, Quota Prompt Modal & Full-Screen Knowledge Manager**
  * Build Side Panel components: Contextual Saved Banner, Storage Quota Exceeded Modal (allocate disk space vs. cleanup), Related Past Reading, Library Feed with domain filter pills, and Semantic Search view.
  * Build Full-Screen Knowledge Manager (`options`) with bulk cleanup tools, storage cap configuration, and `.zip` (Markdown) / `.json` export.
* **Phase 6: In-Page Highlighting & Optional Gemini Nano RAG Synthesis**
  * Implement click-to-jump scrolling and CSS Custom Highlight API in the Content Script.
  * Add optional on-device Q&A synthesis using Chrome's `window.ai` Prompt API.
