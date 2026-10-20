/** Query params that carry tracking data only and never affect content. */
const TRACKING_EXACT = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'yclid',
  'igshid',
  'ref',
  'ref_src',
  'ref_url',
  'referrer',
  'source',
  'spm',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
]);
const TRACKING_PREFIXES = ['utm_', 'mc_', 'pk_', 'hsa_'];

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  return TRACKING_EXACT.has(k) || TRACKING_PREFIXES.some(p => k.startsWith(p));
}

/**
 * Produces a stable canonical form of a URL: no hash, no tracking params,
 * lowercase host, no trailing slash (except root), sorted remaining params.
 * Returns the input unchanged if it is not a parseable URL.
 */
export function canonicalizeUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();

  const kept: Array<[string, string]> = [];
  u.searchParams.forEach((value, key) => {
    if (!isTrackingParam(key)) kept.push([key, value]);
  });
  kept.sort(([a, av], [b, bv]) =>
    a === b ? av.localeCompare(bv) : a.localeCompare(b),
  );
  u.search = '';
  for (const [k, v] of kept) u.searchParams.append(k, v);

  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '') || '/';

  return u.toString();
}
