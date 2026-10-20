const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

/** Lowercases, splits on non-alphanumerics (unicode-aware), drops stopwords. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    t => !STOPWORDS.has(t),
  );
}

const K1 = 1.2;
const B = 0.75;

/**
 * BM25-lite lexical scoring of `docs` against `query`, using the provided doc
 * set as the corpus for IDF. Scores are normalized to [0,1] by dividing by the
 * maximum score (all zeros when nothing matches).
 */
export function lexicalScores(query: string, docs: string[]): number[] {
  const qTokens = [...new Set(tokenize(query))];
  const n = docs.length;
  if (n === 0 || qTokens.length === 0) return docs.map(() => 0);

  const tfs = docs.map(d => {
    const m = new Map<string, number>();
    for (const t of tokenize(d)) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  });
  const lens = tfs.map(m => {
    let l = 0;
    for (const c of m.values()) l += c;
    return l;
  });
  const avgLen = lens.reduce((x, y) => x + y, 0) / n || 1;

  const idf = new Map<string, number>();
  for (const q of qTokens) {
    let df = 0;
    for (const m of tfs) if (m.has(q)) df++;
    idf.set(q, Math.log(1 + (n - df + 0.5) / (df + 0.5)));
  }

  const raw = tfs.map((m, i) => {
    let s = 0;
    for (const q of qTokens) {
      const tf = m.get(q) ?? 0;
      if (tf === 0) continue;
      const denom = tf + K1 * (1 - B + (B * (lens[i] as number)) / avgLen);
      s += (idf.get(q) as number) * ((tf * (K1 + 1)) / denom);
    }
    return s;
  });
  const max = Math.max(...raw);
  return max > 0 ? raw.map(s => s / max) : raw.map(() => 0);
}
