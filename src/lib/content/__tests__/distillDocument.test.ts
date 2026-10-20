// @vitest-environment jsdom
import { distillDocument } from '../distillDocument';
import { describe, it, expect } from 'vitest';

const para = (n: number) =>
  `<p>${Array.from({ length: 40 }, (_, i) => `word${n}x${i}`).join(' ')}.</p>`;

function makeDoc(body: string): Document {
  return new DOMParser().parseFromString(
    `<html><head><title>My Article</title></head><body><nav>menu</nav><article><h1>My Article</h1>${body}</article></body></html>`,
    'text/html',
  );
}

describe('distillDocument', () => {
  it('extracts markdown/text, strips scripts, never mutates the original', () => {
    const doc = makeDoc(
      `${para(1)}${para(2)}${para(3)}<script>alert(1)</script><img src=x onerror="alert(2)">${para(4)}`,
    );
    const before = doc.documentElement.outerHTML;
    const res = distillDocument(doc, 'https://example.com/post');
    expect(doc.documentElement.outerHTML).toBe(before);
    expect(doc.querySelector('script')).not.toBeNull();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.title).toBe('My Article');
    expect(res.data.wordCount).toBeGreaterThan(100);
    expect(res.data.readingTimeMinutes).toBeGreaterThanOrEqual(1);
    expect(res.data.markdown).toContain('word1x0');
    expect(res.data.markdown).not.toContain('alert');
    expect(res.data.textContent).not.toContain('alert');
    expect(res.data.siteName).toBe('example.com');
  });
  it('fails TOO_SHORT for tiny pages', () => {
    const res = distillDocument(
      makeDoc('<p>Tiny.</p>'),
      'https://example.com/',
    );
    expect(res).toEqual({ ok: false, error: 'TOO_SHORT' });
  });
  it('fails NOT_READABLE for empty documents', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body></body></html>',
      'text/html',
    );
    const res = distillDocument(doc, 'https://example.com/');
    expect(res.ok).toBe(false);
  });
});
