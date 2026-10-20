/**
 * Cosine similarity. For L2-normalized vectors this reduces to a plain dot
 * product. Safe for zero vectors and dimension mismatch (returns 0).
 */
export function cosineSimilarity(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  const sim = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return Number.isFinite(sim) ? sim : 0;
}

/**
 * Fast path for vectors already L2-normalized (as produced by the embedder):
 * cosine == dot product. Returns 0 on dimension mismatch.
 */
export function dotProduct(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] as number) * (b[i] as number);
  return dot;
}
