import { describe, it, expect } from 'vitest';
import { chunkText } from '../chunkText';

const words = (t: string) => t.split(/\s+/).filter(Boolean);
const sentence = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ') + '.';

describe('chunkText', () => {
  it('returns [] for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n ')).toEqual([]);
  });
  it('returns a single chunk for short text', () => {
    expect(chunkText('Hello world. Bye.')).toEqual([
      { chunkIndex: 0, text: 'Hello world. Bye.' },
    ]);
  });
  it('splits on sentence boundaries with 30-word overlap', () => {
    const text = Array.from({ length: 30 }, (_, i) =>
      sentence(20, `s${i}w`),
    ).join(' ');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(2);
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i);
      expect(words(c.text).length).toBeLessThanOrEqual(190);
      expect(c.text.endsWith('.')).toBe(true);
    });
    for (let i = 1; i < chunks.length; i++) {
      const prev = words(chunks[i - 1]!.text);
      expect(words(chunks[i]!.text).slice(0, 30)).toEqual(prev.slice(-30));
    }
  });
  it('hard-splits very long sentences', () => {
    const chunks = chunkText(
      Array.from({ length: 500 }, (_, i) => `w${i}`).join(' '),
    );
    expect(chunks.length).toBeGreaterThan(2);
    chunks.forEach(c => expect(words(c.text).length).toBeLessThanOrEqual(190));
    expect(words(chunks[0]!.text)[0]).toBe('w0');
    expect(words(chunks[chunks.length - 1]!.text).at(-1)).toBe('w499');
  });
});
