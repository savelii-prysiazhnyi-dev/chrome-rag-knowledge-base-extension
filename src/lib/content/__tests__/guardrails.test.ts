import { describe, it, expect } from 'vitest';
import { isSensitiveOrUnsupportedUrl } from '../guardrails';

describe('isSensitiveOrUnsupportedUrl', () => {
  it.each([
    'chrome://settings',
    'chrome-extension://abc/page.html',
    'file:///etc/passwd',
    'ftp://a.com/x',
    'about:blank',
    'http://localhost:3000/',
    'http://127.0.0.1/',
    'http://192.168.1.5/',
    'http://10.0.0.1/',
    'http://172.20.0.1/',
    'http://[::1]/',
    'https://mail.google.com/mail/u/0/',
    'https://secure.chase.com/home',
    'https://shop.com/checkout/step1',
    'https://site.com/login',
    'garbage',
  ])('blocks %s', u => expect(isSensitiveOrUnsupportedUrl(u)).toBe(true));

  it.each([
    'https://go.dev/doc/effective_go',
    'https://blog.example.com/posts/blogging-tips',
    'http://172.32.0.1/',
  ])('allows %s', u => expect(isSensitiveOrUnsupportedUrl(u)).toBe(false));

  it('supports a custom domain list', () => {
    expect(
      isSensitiveOrUnsupportedUrl('https://secret.corp/a', {
        sensitiveDomains: ['secret.corp'],
      }),
    ).toBe(true);
  });
});
