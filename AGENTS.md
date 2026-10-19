# Agent Instructions & Engineering Guidelines (`AGENTS.md`)

## 1. Project Overview

**`chrome-rag-knowledge-base-extension`** is a privacy-first, 100% local-first Chrome extension (Manifest V3) that turns the browser into a personal semantic knowledge assistant ("Second Brain").

- **Explicit Curation:** Users intentionally save articles via the Side Panel (`Remember`) or `Alt + S`.
- **Content Distillation:** Clones the active DOM and uses `@mozilla/readability`, `DOMPurify`, and `turndown` to extract clean plain text and Markdown without mutating the live page.
- **On-Device ML & Hybrid Search:** Runs `@huggingface/transformers` (`all-MiniLM-L6-v2` via WebGPU/WASM) inside an Offscreen Document to generate 384-dimensional `Float32Array` embeddings, combining Cosine Similarity with lexical matching.
- **3NF Vertically Partitioned IndexedDB & Storage Gatekeeper:** Stores metadata (`articles`), full text/Markdown (`article_contents`), and vector embeddings (`chunks`) in a shared IndexedDB instance governed by a Two-Layer User-Controlled Storage Quota (`50 MB` baseline cap; prompts the user before consuming additional disk space).

---

## 2. Project Map & Documentation Index

### Repository Files & Documentation

- **Specifications & Architecture (`docs/`):**
  - [`docs/SPECIFICATION.md`](./docs/SPECIFICATION.md) — Master product, architecture, schema, and ADR specification (`v1.2.0`).
  - [`docs/wxt-mv3-architecture.md`](./docs/wxt-mv3-architecture.md) — Manifest V3 process model, 5 core entrypoints, CSP, and IPC topology guide.
  - [`docs/sample-user-flow.mmd`](./docs/sample-user-flow.mmd) — Mermaid sequence diagram of the ingestion, quota gatekeeper, and hybrid search flows.
- **Changelog & Project Metadata:**
  - [`CHANGELOG.md`](./CHANGELOG.md) — Release history and `[Unreleased]` change tracking ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)).
  - [`package.json`](./package.json) — Package manifest, scripts, and Semantic Versioning (`0.1.0`).
  - [`README.md`](./README.md) — User-facing project overview and setup guide.
- **Tooling & Configuration:**
  - [`.oxlintrc.json`](./.oxlintrc.json) — Oxlint configuration (`typescript`, `react`, `unicorn`, `oxc`, `promise` plugins + `webextensions` env).
  - [`.prettierrc`](./.prettierrc) & [`.prettierignore`](./.prettierignore) — Prettier code formatting rules and ignore paths.
  - [`.gitignore`](./.gitignore) — Git ignore rules for dependencies and build outputs.
- **Agent Rules & Skills (`.agents/`):**
  - [`.agents/rules/workflow.md`](./.agents/rules/workflow.md) — 3-Agent Development Pipeline Rule (Architect/Orchestrator -> Lead Implementer -> QA Tester).
  - [`.agents/skills/qa-verify/SKILL.md`](./.agents/skills/qa-verify/SKILL.md) & [`.agents/skills/qa-verify/scripts/verify.sh`](./.agents/skills/qa-verify/scripts/verify.sh) — Automated QA verification skill and dynamic check runner.
  - [`.agents/skills/commit/SKILL.md`](./.agents/skills/commit/SKILL.md) — Conventional Commit workflow skill.

### Planned Source Layout (`src/`)

- `src/entrypoints/background/` — Manifest V3 Background Service Worker (coordinator, tab badge sync, storage quota gatekeeper).
- `src/entrypoints/content/` — Content Script (cloned-DOM Readability extraction, Markdown conversion, ~160-word sliding-window chunker, CSS Custom Highlight API deep-linking).
- `src/entrypoints/offscreen/` — Offscreen Document AI worker (`@huggingface/transformers` embedding pipeline and hybrid search engine).
- `src/entrypoints/sidepanel/` — React 19 + Tailwind CSS Side Panel companion UI.
- `src/entrypoints/options/` — Full-Screen Knowledge Manager (`options.html`) for bulk cleanup, quota management, and `.zip` / `.json` export.
- `src/db/` — Shared IndexedDB (`idb`) relational + vector storage layer (`articles`, `article_contents`, `chunks`).

### External Technical References

- [WXT Framework Documentation](https://wxt.dev/)
- [Chrome Extensions Manifest V3 Documentation](https://developer.chrome.com/docs/extensions/develop)
- [Hugging Face Transformers.js v3 Documentation](https://huggingface.co/docs/transformers.js)
- [IndexedDB API & `idb` Library](https://github.com/jakearchibald/idb)
- [Oxlint Rules & Configuration Reference](https://oxc.rs/docs/guide/usage/linter.html)

---

## 3. Mandatory Project Rules & Workflow

### Rule 1: 3-Agent Development Pipeline ([`.agents/rules/workflow.md`](./.agents/rules/workflow.md))

Whenever implementing a feature, refactor, or code task, follow the **3-Agent Pipeline** defined in [`.agents/rules/workflow.md`](./.agents/rules/workflow.md):

1. **Architect & Orchestrator (Gemini 4 Argon):** Defines isolated `implementer` and `qa-tester` subagents (`enable_subagent_tools: false`), delegates implementation and verification, audits the final `git diff`, and commits approved changes.
2. **Lead Implementer (`implementer` — `Model="pro"`: Sonnet with Medium thinking level (`sonnet-5.5-medium`), with automatic fallback to `Model="flash"`: Gemini 3.8 Flash with High thinking level (`gemini-3.8-flash-high`)):** Implements the user-provided task specification, updates `CHANGELOG.md` and `docs/`, runs `pnpm run format`, and leaves changes uncommitted for QA and review.
3. **QA Tester (`qa-tester` — `Model="flash"`: Gemini 3.8 Flash with High thinking level (`gemini-3.8-flash-high`)):** Executes the [`qa-verify` skill](./.agents/skills/qa-verify/SKILL.md) (`bash .agents/skills/qa-verify/scripts/verify.sh`) and loops with the Implementer until all checks pass with 0 errors.

### Rule 2: Code Quality Verification (Lint, Format, Typecheck)

After making any code or configuration changes, all quality checks executed by [`qa-verify`](./.agents/skills/qa-verify/SKILL.md) **MUST** pass with **0 errors** before committing:

1. **Linting (`oxlint`):**
   ```bash
   pnpm run lint
   ```
2. **Formatting (`prettier`):**
   ```bash
   pnpm run format
   pnpm run format:check
   ```
3. **Typechecking (`tsc`):**
   ```bash
   pnpm run typecheck
   ```
   _(Run `pnpm run typecheck` / `pnpm exec tsc --noEmit` once TypeScript configuration is initialized in Phase 1)._

### Rule 3: Architectural & Subsystem Documentation in [`docs/`](./docs/)

Whenever a major subsystem, data flow, or non-trivial architectural decision is designed or implemented, the agent **MUST** create or update a dedicated Markdown document in [`docs/`](./docs/) (for example: `docs/storage-engine.md`, `docs/embedding-pipeline.md`, `docs/hybrid-search.md`, `docs/messaging-protocol.md`).

- **Purpose:** These documents act as both **long-term architectural memory** for AI agents (explaining _why_ decisions were made and _how_ they are implemented) and **deep-dive learning guides** for the developer.
- Whenever a new doc is added to `docs/`, link it in **Section 2 (Project Map)** of this [`AGENTS.md`](./AGENTS.md) file.

### Rule 4: Maintaining [`CHANGELOG.md`](./CHANGELOG.md) & Semantic Versioning

1. **Changelog Maintenance:** Every notable addition, change, fix, or architectural decision must be recorded in [`CHANGELOG.md`](./CHANGELOG.md) under `[Unreleased]` (or the active release heading) following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
2. **Semantic Versioning (SemVer):** Manage the extension version in [`package.json`](./package.json) (and manifest) strictly following [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html):
   - `MAJOR`: Incompatible architectural or database schema changes requiring migration.
   - `MINOR`: Backwards-compatible new features or completed roadmap phases (e.g., `0.1.0` -> `0.2.0`).
   - `PATCH`: Backwards-compatible bug fixes, performance tuning, or documentation refinements.

### Rule 5: Automatic Commits via the `commit` Skill ([`.agents/skills/commit/SKILL.md`](./.agents/skills/commit/SKILL.md))

Whenever the agent completes a change to the repository, it **MUST** commit the work using the conventions in [`.agents/skills/commit/SKILL.md`](./.agents/skills/commit/SKILL.md):

- Format: `<type>(<scope>): <short description>` (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`), lowercase, imperative mood, no trailing period, and **never** include AI co-author credit.
- Stage explicit file paths via `git add <file1> <file2> ...` (never `git add .` or `git add -A`).
- **No Confirmation Needed:** Execute all phases (crafting the commit message, selecting relevant files, staging, and committing) automatically at the end of each change without pausing to ask for user confirmation.

## 4. Core Philosophy: Deep Engineering & Learning

- **Explain the Theory & Internals:** Do not just output code. Explain _how_ and _why_ things work under the hood (e.g., Chrome Manifest V3 process isolation, Service Worker lifecycles, IndexedDB B-tree indexes and Structured Clone binary serialization, ONNX Runtime Web / WebGPU execution, WordPiece tokenization, and dense vs. lexical vector retrieval).
- **Compare Industry Patterns & Trade-offs:** Discuss the common ways problems are solved in production systems, why a specific pattern was chosen for this architecture, and what trade-offs exist.
