import type { ArticleRecord, ChunkRecord } from '../../types/messages';
import { dotProduct } from './similarity';
import { lexicalScores } from './lexical';

export const DEFAULT_ALPHA = 0.7;

const clamp01 = (x: number) =>
  Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;

/**
 * score = alpha * dense + (1 - alpha) * lexical, result in [0,1].
 * Negative cosine values are clamped to 0; alpha is clamped to [0,1].
 */
export function hybridScore(
  dense: number,
  lexical: number,
  alpha: number = DEFAULT_ALPHA,
): number {
  const a = clamp01(alpha);
  return clamp01(a * clamp01(dense) + (1 - a) * clamp01(lexical));
}

export interface RankedArticleResult {
  article: ArticleRecord;
  bestSnippet: string;
  chunkIndex: number;
  score: number;
}

export interface RankOptions {
  queryVector: ArrayLike<number>;
  queryText: string;
  chunks: ChunkRecord[];
  articles: ArticleRecord[];
  topK?: number;
  alpha?: number;
  domainFilter?: string;
  starredOnly?: boolean;
}

/**
 * Scores every chunk (hybrid), groups by article keeping the best chunk as the
 * snippet, applies filters, sorts descending and truncates to topK.
 */
export function rankChunksToArticles(opts: RankOptions): RankedArticleResult[] {
  const { queryVector, queryText, topK = 10, alpha = DEFAULT_ALPHA } = opts;
  const byId = new Map<string, ArticleRecord>();
  for (const a of opts.articles) {
    if (opts.domainFilter && a.siteName !== opts.domainFilter) continue;
    if (opts.starredOnly && !a.isStarred) continue;
    byId.set(a.id, a);
  }
  const chunks = opts.chunks.filter(c => byId.has(c.articleId));
  const lex = lexicalScores(
    queryText,
    chunks.map(c => c.text),
  );

  const best = new Map<string, RankedArticleResult>();
  chunks.forEach((c, i) => {
    const score = hybridScore(
      dotProduct(queryVector, c.vector),
      lex[i] as number,
      alpha,
    );
    const cur = best.get(c.articleId);
    if (!cur || score > cur.score) {
      best.set(c.articleId, {
        article: byId.get(c.articleId) as ArticleRecord,
        bestSnippet: c.text,
        chunkIndex: c.chunkIndex,
        score,
      });
    }
  });
  return [...best.values()]
    .sort((x, y) => y.score - x.score)
    .slice(0, Math.max(0, topK));
}
