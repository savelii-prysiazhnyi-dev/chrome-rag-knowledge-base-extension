# Content Pipeline (Phase 3)

Code: `src/lib/content/*` (pure utilities) and `src/entrypoints/content/index.ts` (message wiring).

Flow: guardrails -> `distillDocument` -> `chunkText` -> `canonicalizeUrl` -> `ExtractPageResponse`.

## Why clone the DOM

Readability destructively edits the document it parses (removes nodes, rewrites attributes). Running it on the live page would break the site for the user. We always call `doc.cloneNode(true)` and parse the clone; the live document is never mutated (covered by a unit test).

## Readability internals

`@mozilla/readability` removes unlikely candidates (by class/id regex such as `sidebar`, `comment`, `footer`), scores block elements by text length, comma count, and class/id weights, propagates scores to parent (full) and grandparent (half), applies a link-density penalty, picks the top candidate, merges high-scoring siblings, then cleans (forms, headers with low scores, conditional cleaning of tables/lists). Returns `title`, `byline`, `excerpt`, `siteName`, and `content` HTML. `null` means no article was found -> `NOT_READABLE`.

## DOMPurify

Page HTML is untrusted. Readability output still contains arbitrary attributes/tags (inline handlers, `javascript:` URLs, scripts). We sanitize before converting or ever storing/rendering it, so stored Markdown/text cannot carry active content. We additionally forbid `style`, `form`, `iframe`, `object`, `embed`.

## Turndown

Converts sanitized HTML to Markdown (ATX headings, fenced code). Markdown is compact, LLM/readable-friendly, and preserves structure for export. Plain `textContent` is derived from the sanitized HTML for chunking and word counts.

## Chunking

`all-MiniLM-L6-v2` has a 256 word-piece token limit; WordPiece splits rare words into several tokens, so ~1.3-1.5 tokens/word for English. 160 words target ≈ 210–240 tokens (max ~190 words with overlap ≈ 250), staying under the limit with no truncation. Sentences are kept whole where possible; sentences longer than the target are hard-split by words. A 30-word overlap (~19%) preserves context across boundaries so facts straddling a split remain retrievable.

## URL canonicalization

Strips `#hash`, tracking params (`utm_*`, `mc_*`, `fbclid`, `gclid`, `ref`, ...), lowercases the host, removes trailing slashes, and sorts remaining params, so the same page maps to one article ID (SHA-256 of the canonical URL).

## Guardrails

Blocked before any DOM read: non-http(s) schemes (`chrome://`, `chrome-extension://`, `file://`), localhost/private/link-local IPs, a configurable sensitive-domain list (banking, webmail, identity providers) and sensitive paths (`login`, `auth`, `checkout`, `payment`, ...). Blocked pages return `{ok:false, error:'BLOCKED_URL'}`.

## Trade-offs

- Readability vs. custom heuristics or LLM extraction: mature, offline, fast; fails on app-like pages (-> `NOT_READABLE`).
- Path-based sensitivity is heuristic and may over-block (e.g. blog posts at `/auth/`); the lists are configurable.
- Word-count chunking approximates tokens; exact tokenization would require loading the tokenizer in the content script.
- Tracking param stripping may drop a `ref`/`source` param that is meaningful on rare sites.
