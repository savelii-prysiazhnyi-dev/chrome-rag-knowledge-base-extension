import { describe, it, expect } from 'vitest';
import { hashUrl } from '../hashUrl';

describe('hashUrl', () => {
  it('returns SHA-256 hex', async () => {
    expect(await hashUrl('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('is deterministic and distinct', async () => {
    expect(await hashUrl('https://a.com/')).toBe(
      await hashUrl('https://a.com/'),
    );
    expect(await hashUrl('https://a.com/')).not.toBe(
      await hashUrl('https://b.com/'),
    );
  });
});
