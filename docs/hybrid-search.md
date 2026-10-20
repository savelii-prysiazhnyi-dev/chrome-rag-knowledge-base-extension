# Hybrid Search

Pure logic in `src/lib/search/`; executed by the offscreen document on `SEARCH_QUERY`.

## Signals

- **Dense (semantic):** cosine similarity between the normalized query vector and each chunk vector (a dot product). Catches paraphrases, but can miss exact identifiers.
- **Lexical:** BM25-lite (`k1=1.2`, `b=0.75`) over tokenized chunk text (lowercase, unicode alphanumerics, small stopword list), with IDF computed over the candidate chunks and scores divided by the max, giving [0,1]. Catches exact terms such as `goroutine`.

## Formula

```
score = alpha * max(0, dense) + (1 - alpha) * lexical      alpha = 0.7 (default)
```

All inputs and the result are clamped to [0,1]; `alpha` is clamped to [0,1].

## Aggregation (`rankChunksToArticles`)

1. Apply `domainFilter` (exact `siteName`) and `starredOnly` to articles; drop chunks of excluded articles.
2. Score every remaining chunk.
3. Group by article; keep the highest-scoring chunk as `bestSnippet` / `chunkIndex`; article score = best chunk score.
4. Sort descending and take `topK` (default 10).

Search is a brute-force scan over all chunks, adequate for a personal knowledge base.
