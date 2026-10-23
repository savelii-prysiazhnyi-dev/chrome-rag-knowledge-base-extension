# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- **Experimental Offscreen Web Worker:**
  - Reverted experimental dedicated Web Worker and cooperative job queue inside the Offscreen Document, restoring direct execution of embedding generation and hybrid vector search within `src/entrypoints/offscreen/main.ts` due to Chromium extension process crashes.
  - Reverted per-tab in-flight saving state in `useActiveTab.ts` back to the standard active-tab lifecycle.

### Added

- **Comprehensive Technical Documentation & Production README (`README.md`):**
  - Authored an exhaustive, production-grade `README.md` providing end-to-end documentation across the entire project.
  - Included interactive process topology ASCII/Unicode architecture diagrams, execution realm boundaries, and zero-IPC binary vector storage explanation.
  - Added full annotated directory tree covering `src/`, `docs/`, `public/`, and configuration files.
  - Authored step-by-step Chrome installation and developer setup guides with keyboard shortcuts and pinning instructions.
  - Documented core technical subsystems referencing the 6 architectural specifications in `docs/`.
  - Added Manifest V3 entrypoints overview and complete internal IPC messaging contracts table.
  - Documented security, privacy, CSP compliance model, and full table of verification scripts.

- **Knowledge Graph Extension Icons & Dynamic Active/Inactive Toolbar Switching:**
  - Designed and generated the 4-node connected Knowledge Graph icon assets in SVG and high-DPI rasterized PNG formats (16x16, 32x32, 48x48, 128x128) under `public/icons/`.
  - Configured active (`#13DFD6` luminous cyan) and inactive (`#94A3B8` mid-grey) visual states with transparent backgrounds.
  - Updated `wxt.config.ts` manifest with standard extension `icons` and default inactive `action` toolbar icons.
  - Implemented dynamic per-tab action icon switching in `src/entrypoints/background/index.ts` (`syncTabBadge` and `syncAllTabBadges`) via `chrome.action.setIcon` and `chrome.action.setBadgeText`:
    - Displays active cyan Knowledge Graph icon + `#10b981` green checkmark badge (`✓`) when the active tab is indexed.
    - Displays inactive silver/grey Knowledge Graph icon + cleared badge (`''`) when unindexed, navigating, deleted, or on non-HTTP schemes.
  - Updated `useActiveTab.ts` (`removeTab`) and `App.tsx` (`onArticleDeleted`) in the Side Panel to immediately revert the active tab's toolbar icon to inactive upon article deletion.
  - Added unit test suite in `src/entrypoints/background/__tests__/syncTabBadge.test.ts` and updated `crossWindowSync.test.ts` to assert dynamic `setIcon` and `setBadgeText` transitions.
  - Updated architectural documentation in `docs/wxt-mv3-architecture.md` with Section 5.1 detailing the dynamic toolbar icon lifecycle.

- **Logical Storage Footprint Tracking (`getLogicalStorageUsage`):**
  - Added optional `bytes?: number` field to `ArticleRecord` representing the total serialized payload footprint in bytes (metadata, partitioned content, passage chunks, and 1,536-byte `Float32Array` embeddings).
  - Implemented `getLogicalStorageUsage()` in `src/db/repository.ts` and exported it from `src/db/index.ts`. Returns a deterministic `0` when no articles exist, sums cached `article.bytes` across records, and dynamically computes and backfills legacy records missing `bytes`.
  - Updated `createCoordinator` in `src/entrypoints/background/coordinator.ts` to calculate and assign `bytes: required` during article ingestion.
  - Updated `checkStorageQuota()` in `src/db/quota.ts` to use `getLogicalStorageUsage()` for `currentUsageBytes`, eliminating Chromium LevelDB WAL/SSTable/tombstone directory bloat (1.5–7.2 MB baseline) from storage meters while maintaining graceful fallback to physical metrics.
  - Retained `indexedDBUsageBytes` and `modelCacheUsageBytes` from `navigator.storage.estimate()` for diagnostic inspection, and preserved host machine physical disk guardrail (`freePhysicalDiskBytes < 500 MB`).
  - Updated `StorageFooter`, `StorageQuotaModal`, and `StorageOverviewCard` to display `quotaStatus.currentUsageBytes` directly for a clean 0.0 MB / 0% baseline with 0 articles saved.
  - Added unit test suites in `src/db/__tests__/db.test.ts`, `coordinator.test.ts`, `sidepanelComponents.test.tsx`, and `optionsComponents.test.tsx`.
  - Updated architectural storage documentation in `docs/storage-engine.md`.

### Changed

- **ONNX Runtime Web Bundle Size Optimization (~50% Reduction):**
  - Pruned unused ONNX Runtime Web WASM variants (`.jspi` experimental builds and multi-threaded builds requiring `SharedArrayBuffer`) from `wxt.config.ts`, bundling exclusively the two required flavors: `ort-wasm-simd-threaded.jsep.*` (WebGPU) and `ort-wasm-simd-threaded.asyncify.*` (WASM CPU fallback).
  - Implemented `vite-plugin-eliminate-duplicate-wasm` in `wxt.config.ts` to prevent Vite from emitting an orphaned 26.86 MB copy of `ort-wasm-simd-threaded.asyncify.wasm` into `assets/`.
  - Reduced total unpacked extension footprint from ~114.5 MB to **56.5 MB** and `.zip` distribution archive from ~28 MB to **13.7 MB** with 0 functionality loss.
  - Updated `docs/embedding-pipeline.md` reflecting the optimized runtime asset footprint.

- **Storage UI Simplification & Jargon Removal:**
  - **Storage Overview Card (`StorageOverviewCard.tsx`):**
    - Updated section title to `"Storage Usage"` and subtitle to `"All saved articles and search data are stored locally on your device."`, removing all mentions of IndexedDB, strict budgets, and internal storage mechanisms.
    - Removed redundant `"Approved Cap: {maxMB} MB"` badge and `ShieldCheck` icon.
    - Simplified progress bar metrics to `"Current Usage: {usageMB} MB of {maxMB} MB limit"` and `"{usagePercent}% used"` (replacing "cap" and "utilized").
    - Cleaned up article counter beneath the progress bar to show exclusively saved articles count (e.g. `12 saved articles` / `1 saved article`), removing `vector chunks (384-d Float32Array)` and safety threshold warnings.
    - Removed the on-device AI model cache info block completely.
    - Simplified cap editor labels from `"Quick Cap Presets:"` to `"Preset limits:"`, `"Custom Limit (MB):"` to `"Custom limit (MB):"`, and button label from `"Save Cap"` to `"Save limit"`.
  - **Storage Quota Modal (`StorageQuotaModal.tsx`):**
    - Updated title from `"Storage Quota Gatekeeper"` to `"Storage Limit Reached"`.
    - Simplified usage subtitle to `"Using {usageMB} MB of {maxMB} MB limit"`.
    - Replaced input prompt `"Set a new maximum local IndexedDB cap (MB):"` with `"Set a new storage limit (MB):"`.
  - **Storage Footer (`StorageFooter.tsx`):**
    - Changed button label from `"Storage Quota"` to `"Storage"`.
    - Changed hover title from `"Configure Storage Budget"` to `"Configure Storage Limit"`.
  - **Unit Testing:**
    - Updated `StorageOverviewCard` tests in `src/entrypoints/options/__tests__/optionsComponents.test.tsx` to assert new clean title, subtitle, limits controls, "Save limit" button, singular/plural article counts, and confirm total absence of technical jargon (`Approved Cap`, `On-Device AI Model Cache`, `384-d Float32Array`, `Safety threshold`).
    - Added unit test suites for `StorageFooter` and `StorageQuotaModal` in `src/entrypoints/sidepanel/__tests__/sidepanelComponents.test.tsx` verifying simplified labels and titles.

- **Options Page Design System Modernization (Full Library & Knowledge Manager):**
  - **Header (`OptionsHeader.tsx`):** Removed the legacy purple icon container and `Brain` icon to align with the Side Panel header. Updated title to `"Second Brain — Full Library"` and subtitle to `"Semantic knowledge base in your browser, storage budget, and exports"`. Updated export button icon colors to `text-cyan-700`.
  - **Notification Banner (`App.tsx`):** Shifted notification alert from indigo to cyan theme (`border-cyan-200 bg-cyan-50/70 text-cyan-900`), with `text-cyan-700` for `CheckCircle2` and `text-cyan-600 hover:text-cyan-800` for dismiss.
  - **Storage Overview Card (`StorageOverviewCard.tsx`):** Updated `HardDrive` icon container to `bg-cyan-50 text-cyan-700`, default progress bar to `bg-cyan-700`, model cache indicator dot to `bg-cyan-600`, active preset button to `bg-cyan-700 text-white hover:bg-cyan-800`, custom cap input focus to conservative slate (`focus:border-slate-400 focus:ring-1 focus:ring-slate-300/60`), and Save Cap button to `bg-cyan-700 hover:bg-cyan-800 text-white`.
  - **Articles Table Controls & Rows (`ArticlesTable.tsx` & `ArticleTableRow.tsx`):** Updated search input and domain select focus rings to conservative slate (`focus:border-slate-400 focus:ring-1 focus:ring-slate-300/60`), master and row checkboxes to `text-cyan-700 focus:ring-cyan-600`, selected row background to `bg-cyan-50/30`, article title link hover to conservative `hover:text-slate-900`, and Read Distilled Markdown button hover to conservative `hover:bg-slate-100 hover:text-slate-800`.
  - **Markdown Preview Modal (`MarkdownPreviewModal.tsx`):** Applied conservative slate hover styles to copy (`hover:bg-slate-50 hover:text-slate-900`) and close (`hover:bg-slate-100 hover:text-slate-700`) buttons.
  - **Unit Testing:** Added comprehensive component test suite in `src/entrypoints/options/__tests__/optionsComponents.test.tsx` verifying Options header, storage card, table controls, table row states, and Markdown modal copy/close actions.

- **Unified Header Block, Centered Partial Separators & Cyan "All" Filter Pill:**
  - Unified `SidePanelHeader`, `ActiveTabBanner`, and `SearchBar`/`DomainFilterPills` within a single white header container (`<header className="border-b border-slate-200 bg-white px-4 pt-3.5 pb-3">`) in `src/entrypoints/sidepanel/App.tsx`.
  - Removed root `mt-3` margin in `src/entrypoints/sidepanel/components/ActiveTabBanner.tsx` and wrapped both partial dull grey dividers in `<div className="my-3 flex items-center justify-center"><div className="h-px w-3/5 bg-slate-200" /></div>` to achieve 100% vertical centering between sections.
  - Updated the active state fill color of the "All" filter pill in `src/entrypoints/sidepanel/components/DomainFilterPills.tsx` to cyan (`bg-cyan-700 text-white shadow-2xs hover:bg-cyan-800`), visually aligning it with active domain filter pills.
  - Added test coverage in `src/entrypoints/sidepanel/__tests__/sidepanelComponents.test.tsx` verifying the active cyan styling on the "All" button.

- **Refined Header Separator Placement, Copied Badge & Selection Highlights:**
  - Repositioned dull grey middle separator (`<div className="mx-auto my-2.5 h-px w-3/5 bg-slate-200" />`) in `src/entrypoints/sidepanel/App.tsx` between `SidePanelHeader` and `ActiveTabBanner`, framing the header block cleanly with `border-b border-slate-200/80 bg-white px-4 pt-3 pb-3`.
  - Softened active tab copied URL badge styling in `src/entrypoints/sidepanel/components/ActiveTabBanner.tsx` from vivid cyan to conservative slate (`bg-slate-200/80 text-slate-700 font-medium`).
  - Updated global text selection highlight styling across both side panel (`sidepanel/index.html`) and Knowledge Manager options page (`options/index.html`) from cyan/indigo to conservative slate tone (`selection:bg-slate-200 selection:text-slate-900`).

- **Side Panel Layout, Active Tab States & Conservative Hover Styles:**
  - Added centered dull grey middle separator (`<div className="mx-auto my-3 h-px w-3/5 bg-slate-200" />`) under the header in `src/entrypoints/sidepanel/App.tsx`, replacing the harsh start-to-end border and introducing balanced vertical breathing room between the active tab header block and search bar.
  - Redesigned `ActiveTabBanner.tsx` with distinct active states:
    - **Not Saved State:** Displays a full-width (`w-full`) "Remember this page" primary cyan button (`bg-cyan-700 hover:bg-cyan-800 active:bg-cyan-900 text-white font-medium py-2 text-xs rounded-md shadow-2xs`).
    - **Saved State:** Displays a check indicator ("This page is saved") alongside reading time and indexing status under the link pill, followed by balanced equal-width "Update" (primary cyan) and "Delete" (conservative border button) actions spanning the row.
  - Refined interaction styles across side panel components with conservative and understated hover/focus states:
    - `SearchBar.tsx`: Conservative slate focus border and ring (`focus:border-slate-400 focus:ring-slate-300/60`).
    - `ArticleCard.tsx` & `SearchResultCard.tsx`: Subtle hover border and background (`hover:border-slate-300 hover:bg-slate-50/30`), with understated title hover (`group-hover:text-slate-900`).
    - `DomainFilterPills.tsx`: Conservative slate hover styling on filter pills and dropdown items (`hover:bg-slate-100 hover:text-slate-900`), and clean selected indicator (`bg-slate-100 font-medium text-slate-800`).
    - `ActiveTabBanner.tsx`: Conservative URL link pill hover (`hover:border-slate-300 hover:bg-slate-100/50`).
  - Updated unit tests in `src/entrypoints/sidepanel/__tests__/sidepanelComponents.test.tsx` to verify new button copy, saved check indicator, and equal-width layout.

### Refactored

- **Modular React Architecture & Custom Hooks (`sidepanel` & `options`):**
  - Outsourced business logic from monolithic `App.tsx` files into specialized custom hooks:
    - `src/hooks/useStorageQuota.ts`: Shared storage quota tracking, polling, and cap expansion with optional `unlimitedStorage` permission requests.
    - `src/entrypoints/sidepanel/hooks/useActiveTab.ts`: Active tab URL/title tracking, `CHECK_TAB_STATUS` verification, `rememberTab()`, `removeTab()`, `updateTab()`, and message subscription management.
    - `src/entrypoints/sidepanel/hooks/useSearchAndRelated.ts`: 250ms debounced hybrid search, proactive related articles querying, and `SCROLL_AND_HIGHLIGHT` click-to-jump tab navigation.
    - `src/entrypoints/sidepanel/hooks/useLibraryArticles.ts`: Library feed retrieval, domain counts, starred/domain filtering, star toggles, and single/bulk deletions.
    - `src/entrypoints/options/hooks/useKnowledgeManager.ts`: Full data management, table search/domain/starred filtering, multi-row selection, bulk unstarred cleanup drawer, `.zip` / `.json` export orchestration, and on-demand Markdown preview modal loading.
  - Decomposed Side Panel UI into 9 focused components in `src/entrypoints/sidepanel/components/`: `SidePanelHeader`, `ActiveTabBanner`, `RelatedArticlesStrip`, `SearchBar`, `DomainFilterPills`, `ArticleCard`, `SearchResultCard`, `StorageFooter`, and `StorageQuotaModal`, reducing `sidepanel/App.tsx` to a clean ~240-line orchestrator.
  - Decomposed Knowledge Manager UI into 6 focused components in `src/entrypoints/options/components/`: `OptionsHeader`, `StorageOverviewCard`, `BulkCleanupDrawer`, `ArticlesTable`, `ArticleTableRow`, and `MarkdownPreviewModal` (with 1-click clipboard copy support), reducing `options/App.tsx` to a clean ~130-line orchestrator.
  - Extracted shared formatting utilities to `src/lib/utils/format.ts` (`formatBytesToMB`, `formatShortDate`, `formatDate`, `todayDateStamp`) and exported `SearchResultItem` interface in `src/types/messages.ts`.

### Added

- **Shortcut & Cross-Context Loading State Synchronization (`Alt+S`):**
  - Extended `ExtensionMessage` with `SAVE_STARTED` (`{ tabId: number; url?: string }`) and `SAVE_FAILED` (`{ tabId: number; result: SaveTabResult }`) message contracts and exported `SaveTabResult` in `src/types/messages.ts`.
  - Updated background coordinator (`src/entrypoints/background/coordinator.ts`) to broadcast `SAVE_STARTED` upon initiating tab extraction/indexing, and `SAVE_FAILED` upon incognito restrictions, extraction failures, quota blocks, or unexpected runtime exceptions.
  - Enhanced `src/entrypoints/sidepanel/hooks/useActiveTab.ts` to listen for `SAVE_STARTED` and `SAVE_FAILED`, activating the `"Saving..."` loading spinner and disabled state across the Side Panel UI when `Alt+S` is triggered from web pages via `chrome.commands`, and resetting `isSaving` upon `DATABASE_UPDATED` or `SAVE_FAILED`.
  - Added an in-panel `window.addEventListener('keydown', ...)` listener in `useActiveTab.ts` to capture `Alt+S` when focus is held inside the Side Panel extension window and delegate to `saveOrUpdateTab()`.

- **Phase 5: Side Panel UI, Quota Prompt Modal, Background Search/Badge Routing & Full-Screen Knowledge Manager:**
  - Installed `fflate` in `dependencies` and implemented pure client-side export utilities in `src/lib/export/index.ts` (`formatArticleMarkdownWithFrontmatter`, `sanitizeExportFilename`, `buildMarkdownZipArchive`, `buildJsonExportPayload`, `triggerBrowserDownload`) with 5 unit tests in `src/lib/export/__tests__/export.test.ts`.
  - Enhanced `src/entrypoints/background/index.ts` with on-demand Offscreen Document creation and message forwarding for `SEARCH_QUERY` and `FIND_RELATED_ARTICLES`, live `✓` toolbar badge synchronization on `chrome.tabs.onActivated` and `chrome.tabs.onUpdated`, and `DELETE_ARTICLES` / `UPDATE_STORAGE_CAP` message handlers.
  - Added `FIND_RELATED_ARTICLES` handler and empty-query guards in `src/entrypoints/offscreen/main.ts`.
  - Built full reactive Side Panel UI (`src/entrypoints/sidepanel/App.tsx`) featuring the Contextual Active Tab Banner (`Remember Alt+S`, `Update`, `Remove`, and inline guardrail error messages), Proactive "Related Past Reading" strip, 250ms debounced Hybrid Search with click-to-jump `SCROLL_AND_HIGHLIGHT` dispatch, Library Reading Feed with `All`/`Starred`/Domain filter pills, live Storage Quota footer, and interactive Storage Quota Gatekeeper Modal (disk allocation + optional `unlimitedStorage` permission request or 1-click 30-day unstarred cleanup).
  - Built Full-Screen Knowledge Manager (`src/entrypoints/options/App.tsx`) featuring live Storage Budget & Quota Control card with quick cap presets (`50 MB`–`1 GB`) and custom MB editor, 1-click Markdown (`.zip`) and JSON export buttons, Bulk Unstarred Cleanup drawer (by age and domain with starred protection), searchable/filterable multi-select articles table, and on-demand 3NF Markdown preview modal.
  - Added architectural documentation in `docs/ui-and-export-architecture.md` and linked it in `AGENTS.md`.

- **Continuous Integration (GitHub Actions):** Added `.github/workflows/ci.yml` running formatting check (`prettier`), lint (`oxlint`), typecheck (`tsc`), unit tests (`vitest`), and extension build (`wxt`) on push and pull request events targeting `master` and `main` branches using Node 22 and pnpm 12.14.0.

- **Phase 4: Offscreen Embedding Engine, Hybrid Search & Background Coordinator:**
  - Added dependency `@huggingface/transformers` (model `Xenova/all-MiniLM-L6-v2`, mean pooling, normalized); `pnpm-workspace.yaml` disables unneeded native build scripts (`onnxruntime-node`, `protobufjs`).
  - `wxt.config.ts` copies ONNX Runtime `.wasm`/`.mjs` files into `ort/` in the build (no CDN); `env.backends.onnx.wasm.wasmPaths` points at them. WebGPU preferred, WASM fallback.
  - Added `src/lib/search/` (`cosineSimilarity`, BM25-lite `lexicalScores`/`tokenize`, `hybridScore` 0.7/0.3, `rankChunksToArticles` with `domainFilter`/`starredOnly`) and `src/lib/embeddings/` (`Embedder` with injectable pipeline and batching).
  - Offscreen document now handles `GENERATE_EMBEDDINGS_JOB` (embed, direct IndexedDB write, `markArticleFailed` on error, `ARTICLE_INDEXED`) and `SEARCH_QUERY` (`SEARCH_RESULTS`).
  - Background `saveTab(tabId)` coordinator (`src/entrypoints/background/coordinator.ts`) shared by `Alt+S` and `SAVE_ACTIVE_TAB`: in-flight lock, incognito block, quota gate, SHA-256 article id (`hashUrl`), offscreen document mutex, badge on `ARTICLE_INDEXED`, real `CHECK_TAB_STATUS`.
  - Added 21 unit tests; added `docs/embedding-pipeline.md` and `docs/hybrid-search.md`.

### Changed

- **Side Panel UI/UX Modernization & Simplification:**
  - **Header:** Removed the purple brain icon square, simplified subtitle from "Local RAG Assistant" to "Semantic knowledge base in your browser", and renamed "Manager" to "Full Library" with an `ExternalLink` icon.
  - **Active Tab Link & 1-Click Copy:** Added a thin rounded component under the header displaying the active tab URL with a `Link2` icon, monospace text, and a 2-second "Copied!" feedback pill upon clicking.
  - **De-unified Saved Status & Action Controls:** Eliminated the outer background card container (`border border-slate-200 bg-slate-50 p-2.5 rounded-lg`), separating saved/not-saved status indicators (emerald/amber dots + reading time + indexing status) from text-only cyan action buttons (`Remember`, `Update`, `Delete`) without icon noise.
  - **Single Domain Dropdown Filter:** Replaced multi-domain button lists with `All`, `Starred`, and a single `Domain` button expanding a dropdown of available domains `{siteName} ({count})` with active cyan pill styling and 1-click clearing.
  - **Search Result Cards:** Aligned search cards with library feed styling (site favicons with `Globe` fallback, article excerpts under the title instead of raw snippet blocks, and text-only cyan `{match}% match` labels without pill backgrounds).
  - **Theme Accent:** Shifted the primary Side Panel accent palette from purple/indigo to **cyan** (`cyan-700`, `cyan-800`, `cyan-600`, `cyan-50`).

- Renamed side-panel intent `INDEX_CURRENT_TAB` to `SAVE_ACTIVE_TAB`; removed it from the content script. `GENERATE_EMBEDDINGS_JOB` and `SEARCH_QUERY` now carry `target: 'offscreen'` so only the offscreen document handles them.

### Removed

- **Proactive Related Past Reading:** Removed `RelatedArticlesStrip.tsx` and stripped proactive `FIND_RELATED_ARTICLES` background queries and state from `useSearchAndRelated.ts`.

- **Phase 3: Content Script, Readability Distillation & Guardrails:**
  - Added dependencies `@mozilla/readability`, `dompurify`, `turndown`; dev dependencies `@types/turndown`, `jsdom`.
  - Added pure content pipeline modules in `src/lib/content/`: `canonicalizeUrl` (strips hash and tracking params), `guardrails` (blocks non-http(s), private hosts, sensitive domains/paths), `distillDocument` (non-destructive cloned-DOM Readability, DOMPurify sanitization, Turndown Markdown), and `chunkText` (sentence-aware ~160-word chunks, 30-word overlap).
  - Added `EXTRACT_PAGE` message and `ExtractPageResponse` union in `src/types/messages.ts`; `INDEX_CURRENT_TAB` now returns the full extraction result from `src/entrypoints/content/index.ts`.
  - Added 30 unit tests in `src/lib/content/__tests__/` (jsdom via per-file environment).
  - Added `docs/content-pipeline.md`, linked in `AGENTS.md`.
- **Phase 2: IndexedDB Relational + Vector Store & Quota Gatekeeper (`src/db`):**
  - Installed `idb` in dependencies; installed `vitest`, `fake-indexeddb`, and `@types/node` in `devDependencies`.
  - Configured `test` (`vitest run`) and `test:watch` (`vitest`) scripts in `package.json`, along with `vitest.config.ts` and `src/test/setup.ts` (`fake-indexeddb/auto`).
  - Implemented strongly typed 3NF schema and database connection client in `src/db/schema.ts` and `src/db/client.ts` with singleton lifecycle methods (`getDB`, `closeDB`, `resetDB`) across 3 stores:
    - `'articles'` (`id` PK; indexes: `'by_url'` [unique], `'by_siteName'`, `'by_savedAt'`, `'by_isStarred'`).
    - `'article_contents'` (`articleId` PK/FK; 1:1 vertical partition storing clean text and Markdown).
    - `'chunks'` (`id` PK; index: `'by_articleId'`; native `Float32Array(384)` binary vectors).
  - Implemented relational and vector CRUD repository with atomic multi-store transactions in `src/db/repository.ts`:
    - `upsertArticleWithContent`: Atomic transaction preserving original `isStarred` and `savedAt`, updating `updatedAt`, replacing full text, and wiping stale child chunks on re-index.
    - `saveArticleChunks`: Atomically replaces child chunks with binary vectors (`Float32Array(384)`) and sets `article.status = 'indexed'`.
    - `getArticleChunkCount`: Strict 3NF count query via `by_articleId` index in $O(\log N)$ time without chunk deserialization.
    - `listArticles`: Reverse-chronological traversal via `by_savedAt` index cursor with optional domain and starred filtering.
    - `getDomainCounts`: Aggregated article counts per domain sorted by count descending.
    - `deleteArticles`: Atomic cascading deletion removing metadata, partitioned content, and all child vectors (zero orphaned vectors).
    - `bulkDeleteUnstarred`: Single-transaction bulk cleanup matching age cutoff and/or domain while strictly protecting starred articles.
    - Additional utilities: `getArticleById`, `getArticleByUrl`, `getArticleContent`, `getChunksByArticleId`, `getAllChunks`, `toggleArticleStar`, and `markArticleFailed`.
  - Implemented Two-Layer Storage Quota Gatekeeper in `src/db/quota.ts`:
    - Manages `StorageSettings` in `chrome.storage.local` with in-memory fallback, defaulting to 50 MB baseline cap and 85% warning threshold.
    - `estimatePayloadBytes`: Accurately estimates serialized byte footprint of metadata, plain text, Markdown, and 1,536 bytes per chunk vector.
    - `checkStorageQuota`: Enforces 85% warning threshold, 100% quota exceeded save block, `< 500 MB` low physical disk guardrail, and suggested expansion budget (250 MB / 2x current cap).
    - `updateStorageCap`: Expands user storage budget in software and records explicit user consent (`hasGrantedDiskExpansion: true`).
  - Created barrel export in `src/db/index.ts`.
  - Added 19 comprehensive unit tests in `src/db/__tests__/db.test.ts` covering 3NF vertical partitioning, binary vector persistence, re-indexing preservation, atomic cascading deletes, bulk unstarred cleanup with starred protection, and all quota gatekeeper states.
  - Added architectural documentation in `docs/storage-engine.md` with Mermaid `erDiagram`, relational/vector coexistence analysis, and quota flowcharts; embedded `erDiagram` in Section 7.1 of `docs/SPECIFICATION.md`; linked new doc in `AGENTS.md`.

- **Phase 1: Project Scaffolding & WXT Manifest V3 Setup:**
  - Installed extension dependencies and build tools: `react` (v19), `react-dom` (v19), `lucide-react`, `wxt`, `@wxt-dev/module-react`, `typescript`, `@types/chrome`, `@types/react`, `@types/react-dom`, `tailwindcss` (v4), and `@tailwindcss/vite`.
  - Configured `package.json` scripts: `dev`, `build`, `zip`, `typecheck`, and `postinstall` (`wxt prepare`).
  - Configured `wxt.config.ts` targeting Manifest V3 with `sidePanel`, `offscreen`, `storage`, `activeTab`, `tabs`, and `scripting` permissions, optional `unlimitedStorage`, `script-src 'self' 'wasm-unsafe-eval'` CSP, and `Alt+S` (`remember-page`) command shortcut.
  - Configured `tsconfig.json` with strict mode, `react-jsx`, and Chrome extension ambient typings extending `./.wxt/tsconfig.json`.
  - Configured `.oxlintrc.json` with WXT auto-imported globals (`defineBackground`, `defineContentScript`, `defineUnlistedScript`, `browser`).
  - Defined shared TypeScript schemas and messaging contracts (`ArticleRecord`, `ArticleContentRecord`, `ChunkRecord`, `StorageSettings`, `ExtensionMessage`) in `src/types/messages.ts`.
  - Implemented the 5 Manifest V3 entrypoints:
    - `src/entrypoints/background/index.ts`: Background Service Worker with `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`, `remember-page` shortcut handler, and runtime message listeners.
    - `src/entrypoints/content/index.ts`: Content Script matching HTTP/HTTPS pages with extraction and highlight listeners.
    - `src/entrypoints/offscreen/index.html` & `main.ts`: Unlisted Offscreen Document AI worker for embedding inference and hybrid search.
    - `src/entrypoints/sidepanel/index.html`, `main.tsx`, and `App.tsx`: Native Side Panel shell with branding, active tab status banner, search and filter bar, empty-state feed, and storage quota dashboard bar.
    - `src/entrypoints/options/index.html`, `main.tsx`, and `App.tsx`: Full-Screen Knowledge Manager (`options.html`) with storage budget overview card (50 MB default baseline cap) and article table placeholder.
  - Added architectural documentation in `docs/wxt-mv3-architecture.md` detailing the Chrome process model, entrypoint mapping, WebAssembly CSP compliance, and action click behavior.

- **Project Specification (`v1.2.0`)** in `docs/SPECIFICATION.md`:
  - **Data Ownership & User-Controlled Storage Quota:** Added `.zip` (Markdown with YAML frontmatter via `turndown` + `fflate`) and `.json` exports, live storage dashboard (`navigator.storage.estimate()`), `< 500 MB` low physical disk guardrail, bulk cleanup tools with starred-article protection, and a Two-Layer Storage Gatekeeper (`50 MB` baseline cap with an explicit user prompt at 85%/100% to either allocate a custom disk space limit or clean up existing articles).
  - **Active Browsing & Contextual Features:** Added toolbar icon checkmark badge (`✓`), contextual Side Panel saved status banner (`[Update] [Remove]`), and proactive Related Past Reading cards.
  - **Search & In-Page Deep Linking:** Added Hybrid Search combining dense Cosine Similarity with lexical/BM25 token matching, plus click-to-jump smooth scrolling and yellow highlighting via the CSS Custom Highlight API (`CSS.highlights`).
  - **Organization & Exploration:** Added Default Reading Feed, domain filter pills with counts, Starred filter toggle, and Full-Screen Knowledge Manager (`options.html`).
  - **Ingestion Guardrails:** Enforced explicit 1-click user saves only (`Remember` button or `Alt + S`), non-destructive cloned-DOM Readability parsing, incognito protection, and sensitive-domain warnings.
  - **Optional RAG Synthesis:** Added on-device natural language Q&A specification using Chrome's built-in Prompt API (`window.ai` / Gemini Nano).
- **Tooling Setup:**
  - Configured `oxlint` (`.oxlintrc.json`) with React, TypeScript, Unicorn, Oxc, and Promise plugins, targeted at Chrome extension runtime environments (`browser`, `webextensions`, `serviceworker`, `worker`).
  - Configured `prettier` (`.prettierrc`, `.prettierignore`) with single quotes and avoid arrow parens matching project style.
  - Added `format`, `format:check`, `lint`, and `lint:fix` scripts in `package.json`.
  - Added `.gitignore` ignoring dependencies, build artifacts, and environment files.
- **Agent Engineering Guidelines (`AGENTS.md`) & 3-Agent Development Pipeline (`.agents/rules/workflow.md`):**
  - Defined the core learning & deep-engineering philosophy (explicitly non-"vibe-coding", prioritizing theory, browser/ML internals, and architectural trade-offs).
  - Added `.agents/rules/workflow.md` defining the 3-Agent Development Pipeline: Gemini 4 Argon (Lead Architect & Orchestrator), `implementer` (`Model="pro"`: Sonnet with Medium thinking level `sonnet-5.5-medium`, with automatic quota fallback to `Model="flash"`: Gemini 3.8 Flash with High thinking level `gemini-3.8-flash-high`), and `qa-tester` (`Model="flash"`: Gemini 3.8 Flash with High thinking level `gemini-3.8-flash-high`).
  - Added `.agents/skills/qa-verify/SKILL.md` and `.agents/skills/qa-verify/scripts/verify.sh` to dynamically execute configured `package.json` verification checks (`lint`, `format:check`, `typecheck`, `test`, `build`) and produce structured QA reports.
  - Added project overview, repository map, planned `src/` layout, and external documentation links.
  - Enforced mandatory rules for code quality checks, subsystem architectural documentation in `docs/`, `CHANGELOG.md` maintenance, Semantic Versioning (SemVer), and automatic commits via `.agents/skills/commit/SKILL.md`.

### Changed

- **Database Schema (`docs/SPECIFICATION.md`):**
  - Vertically partitioned full text and Markdown into a dedicated `article_contents` store to keep `articles` lightweight for UI feeds.
  - Changed `ChunkRecord.vector` from `number[]` to binary `Float32Array` with direct IndexedDB read/write from the Offscreen Document.
  - Removed `chunkCount` from `ArticleRecord` to strictly satisfy Third Normal Form (3NF), replacing it with $O(\log N)$ index count queries (`by_articleId`).
  - Adjusted chunk size to `~150–180 words` (30-word overlap) to prevent silent token truncation in `all-MiniLM-L6-v2` (256-token limit).
- **Tech Stack (`docs/SPECIFICATION.md`):**
  - Migrated extension build framework from `@crxjs/vite-plugin` to `WXT` (`wxt`) and upgraded embedding engine to `@huggingface/transformers` (v3).
  - Moved `unlimitedStorage` from required `permissions` to `optional_permissions`.
- **Sequence Diagram (`docs/sample-user-flow.mmd`):**
  - Updated user flow to reflect manual-only saving, storage quota gatekeeper prompt, direct IndexedDB `Float32Array` writes, hybrid search, and in-page highlighting.

### Fixed

- **Canonical Tab Navigation & Window Focusing (`useSearchAndRelated.ts`):** `handleSnippetClick` now canonicalizes target URLs via `canonicalizeUrl` to match open tabs across trailing slashes and tracking parameters (preventing duplicate tab creation) and focuses the window containing existing tabs via `chrome.windows.update`, while removing obsolete highlighting message dispatch.
- **Cross-Window Real-Time State Synchronization (`DATABASE_UPDATED`):** Added a lightweight pub/sub broadcast message (`DATABASE_UPDATED`) to `ExtensionMessage` with change reasons (`article_saved`, `article_deleted`, `article_starred`, `bulk_cleanup`, `cap_updated`). Ingestion in the background coordinator now broadcasts `DATABASE_UPDATED` immediately after writing the initial `indexing` record to IndexedDB, causing newly saved articles to appear in the Side Panel feed and Options table in real time without waiting for embedding generation to finish. Added `chrome.runtime.onMessage` subscriptions in `useLibraryArticles`, `useStorageQuota`, `useKnowledgeManager`, and `useActiveTab`, plus `chrome.storage.onChanged` in `useStorageQuota`. Mutation actions across the Side Panel and Options (starring, deleting, bulk cleanup, storage cap adjustment) now broadcast notifications cross-window, ensuring immediate bidirectional synchronization between all active extension contexts.
- **Storage Quota Isolation for IndexedDB vs. Browser Model Cache (`src/db/quota.ts`):** `checkStorageQuota()` now inspects Chromium's `estimate.usageDetails.indexedDB` (`ExtendedStorageEstimate`) instead of total origin storage (`estimate.usage`). Previously, the ~24.3 MB quantized ONNX model weights (`all-MiniLM-L6-v2`) cached in the browser's Cache API (`window.caches`) were lumped into `currentUsageBytes`, immediately consuming ~48.7% of the default 50 MB budget with 0 articles saved. `StorageQuotaStatus` now isolates IndexedDB article/vector usage and exposes `indexedDBUsageBytes` and `modelCacheUsageBytes`. In the Full-Screen Knowledge Manager (`src/entrypoints/options/App.tsx`), on-device AI model cache usage is displayed as a clean, transparent indicator separate from the article budget.
- **WebGPU Adapter Probe & Poisoned `webInitChain` Prevention (`src/lib/embeddings/transformersPipeline.ts`):** Added `hasUsableWebGpu()` to probe `navigator.gpu?.requestAdapter()` and `adapter.requestDevice()` (destroying the probe device immediately) before calling `@huggingface/transformers` `pipeline()`. Fixes a failure on Linux/Chromium where `'gpu' in navigator` is `true` while `requestAdapter()` returns `null`, which previously threw `[webgpu] Error: Failed to get GPU adapter` and permanently poisoned `@huggingface/transformers`'s internal `webInitChain` promise, causing the subsequent `{ device: 'wasm' }` fallback to immediately re-throw the `[webgpu]` rejection.
- **Self-Healing Content Script Injection (`src/entrypoints/background/index.ts`):** If `chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_PAGE' })` fails (e.g., on tabs opened prior to extension installation or reload), the background coordinator now dynamically injects `content-scripts/content.js` via `chrome.scripting.executeScript` and retries extraction once, and logs the full `remember-page` result object.
- **ONNX Runtime Web WASM Loader Assets:** Dynamically bundle all ONNX Runtime Web WASM and loader variants (`ort-wasm*`, including `.asyncify.mjs`, `.asyncify.wasm`, `.jspi.mjs`, `.jspi.wasm`, `.jsep.*`, and `.wasm`) in `wxt.config.ts`. Fixes `net::ERR_FILE_NOT_FOUND` when extension pages without cross-origin isolation fallback to the single-threaded asyncify loader in the Offscreen Document.
