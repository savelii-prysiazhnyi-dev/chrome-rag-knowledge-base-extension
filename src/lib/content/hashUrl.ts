/** SHA-256 hex digest of a (canonical) URL via Web Crypto. Used as article id. */
export async function hashUrl(canonicalUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalUrl),
  );
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
