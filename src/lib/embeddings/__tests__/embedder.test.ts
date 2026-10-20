import { describe, it, expect, vi } from 'vitest';
import { Embedder, type FeatureExtractor } from '..';

function fakeExtractor(dim = 4) {
  const calls: string[][] = [];
  const fn: FeatureExtractor = async (texts, opts) => {
    calls.push(texts);
    expect(opts).toEqual({ pooling: 'mean', normalize: true });
    const data = new Float32Array(texts.length * dim);
    texts.forEach((t, i) => (data[i * dim] = t.length));
    return { data, dims: [texts.length, dim] };
  };
  return { fn, calls };
}

describe('Embedder', () => {
  it('batches and returns one vector per text in order', async () => {
    const { fn, calls } = fakeExtractor();
    const e = new Embedder(async () => fn, 2);
    const out = await e.embed(['a', 'bb', 'ccc', 'dddd', 'eeeee']);
    expect(calls.map(c => c.length)).toEqual([2, 2, 1]);
    expect(out.map(v => v[0])).toEqual([1, 2, 3, 4, 5]);
    expect(out[0]).toBeInstanceOf(Float32Array);
  });
  it('loads lazily, once', async () => {
    const { fn } = fakeExtractor();
    const load = vi.fn(async () => fn);
    const e = new Embedder(load);
    expect(load).not.toHaveBeenCalled();
    await e.embed(['x']);
    await e.embedOne('y');
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('retries load after failure and handles empty input', async () => {
    const { fn } = fakeExtractor();
    const load = vi
      .fn<() => Promise<FeatureExtractor>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(fn);
    const e = new Embedder(load);
    expect(await e.embed([])).toEqual([]);
    await expect(e.embed(['x'])).rejects.toThrow('boom');
    expect(await e.embed(['x'])).toHaveLength(1);
  });
});
