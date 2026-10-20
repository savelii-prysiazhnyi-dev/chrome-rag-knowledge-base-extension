import { describe, it, expect } from 'vitest';
import { canonicalizeUrl } from '../canonicalizeUrl';

describe('canonicalizeUrl', () => {
  it('strips hash and tracking params, sorts the rest', () => {
    expect(
      canonicalizeUrl(
        'https://Example.COM/a/b/?z=1&utm_source=x&fbclid=y&a=2&gclid=g&ref=h&mc_eid=1#frag',
      ),
    ).toBe('https://example.com/a/b?a=2&z=1');
  });
  it('normalizes trailing slash but keeps root', () => {
    expect(canonicalizeUrl('https://a.com/x/')).toBe('https://a.com/x');
    expect(canonicalizeUrl('https://a.com/?utm_medium=1')).toBe(
      'https://a.com/',
    );
  });
  it('is idempotent and tolerates invalid input', () => {
    const c = canonicalizeUrl('https://a.com/p/?b=1&a=2');
    expect(canonicalizeUrl(c)).toBe(c);
    expect(canonicalizeUrl('not a url')).toBe('not a url');
  });
});
