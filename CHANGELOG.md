# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
