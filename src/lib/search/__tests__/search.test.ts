import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  tokenize,
  lexicalScores,
  hybridScore,
  rankChunksToArticles,
} from '..';
import type { ArticleRecord, ChunkRecord } from '../../../types/messages';

const art = (id: string, over: Partial<ArticleRecord> = {}): ArticleRecord => ({
  id,
  url: `https://${id}.com/`,
  title: id,
  excerpt: '',
  siteName: `${id}.com`,
  savedAt: 1,
  updatedAt: 1,
  readingTimeMinutes: 1,
  isStarred: false,
  status: 'indexed',
  ...over,
});
const chunk = (
  articleId: string,
  chunkIndex: number,
  text: string,
  v: number[],
): ChunkRecord => ({
  id: `${articleId}_chunk_${chunkIndex}`,
  articleId,
  chunkIndex,
  text,
  vector: new Float32Array(v),
});

describe('cosineSimilarity', () => {
  it('computes 1, 0, -1', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });
  it('is safe for zero vectors and mismatch', () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('lexical', () => {
  it('tokenizes and drops stopwords', () => {
    expect(tokenize('The Go-lang, and Rust!')).toEqual(['go', 'lang', 'rust']);
  });
  it('scores matching docs higher, in [0,1]', () => {
    const s = lexicalScores('goroutine channels', [
      'goroutine channels explained',
      'cooking pasta',
    ]);
    expect(s[0]).toBe(1);
    expect(s[1]).toBe(0);
  });
  it('handles empty query / docs', () => {
    expect(lexicalScores('', ['a b'])).toEqual([0]);
    expect(lexicalScores('x', [])).toEqual([]);
  });
});

describe('hybridScore', () => {
  it('uses 0.7/0.3 by default', () => {
    expect(hybridScore(1, 0)).toBeCloseTo(0.7);
    expect(hybridScore(0, 1)).toBeCloseTo(0.3);
    expect(hybridScore(1, 1)).toBeCloseTo(1);
  });
  it('clamps inputs and alpha', () => {
    expect(hybridScore(-1, 0)).toBe(0);
    expect(hybridScore(2, 2, 5)).toBe(1);
    expect(hybridScore(1, 0, 0)).toBe(0);
  });
});

describe('rankChunksToArticles', () => {
  const articles = [
    art('a'),
    art('b', { isStarred: true }),
    art('c', { siteName: 'other.org' }),
  ];
  const chunks = [
    chunk('a', 0, 'unrelated text', [0, 1]),
    chunk('a', 1, 'goroutines', [1, 0]),
    chunk('b', 0, 'goroutines too', [0.6, 0.8]),
    chunk('c', 0, 'nothing', [0, 1]),
  ];
  const base = {
    queryVector: [1, 0],
    queryText: 'goroutines',
    chunks,
    articles,
  };

  it('groups by article, best snippet, sorted desc', () => {
    const r = rankChunksToArticles(base);
    expect(r.map(x => x.article.id)).toEqual(['a', 'b', 'c']);
    expect(r[0]?.bestSnippet).toBe('goroutines');
    expect(r[0]?.chunkIndex).toBe(1);
    expect(r[0]?.score).toBeGreaterThan(r[1]?.score ?? 1);
  });
  it('applies topK, domainFilter, starredOnly', () => {
    expect(rankChunksToArticles({ ...base, topK: 1 })).toHaveLength(1);
    expect(
      rankChunksToArticles({ ...base, domainFilter: 'other.org' }).map(
        x => x.article.id,
      ),
    ).toEqual(['c']);
    expect(
      rankChunksToArticles({ ...base, starredOnly: true }).map(
        x => x.article.id,
      ),
    ).toEqual(['b']);
  });
});
