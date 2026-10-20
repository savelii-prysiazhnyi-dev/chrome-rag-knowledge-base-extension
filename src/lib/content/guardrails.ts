export interface GuardrailOptions {
  /** Domains (and their subdomains) that must never be indexed. */
  sensitiveDomains?: readonly string[];
  /** Path regexes that indicate auth / payment pages. */
  sensitivePaths?: readonly RegExp[];
}

export type GuardrailResult =
  { blocked: false } | { blocked: true; reason: string };

export const DEFAULT_SENSITIVE_DOMAINS: readonly string[] = [
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'outlook.office365.com',
  'mail.yahoo.com',
  'mail.proton.me',
  'proton.me',
  'accounts.google.com',
  'login.microsoftonline.com',
  'paypal.com',
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'citi.com',
  'capitalone.com',
  'americanexpress.com',
  'stripe.com',
  'online.hsbc.com',
  'revolut.com',
  'wise.com',
];

export const DEFAULT_SENSITIVE_PATHS: readonly RegExp[] = [
  /(^|\/)(log-?in|sign-?in|sign-?up|logout|sign-?out|auth|oauth2?|sso|password|reset-password|2fa|mfa|checkout|payment|billing|cart|banking)(\/|$)/i,
];

function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local'))
    return true;
  if (
    h === '::1' ||
    h === '::' ||
    /^f[cd][0-9a-f]{2}:/.test(h) ||
    h.startsWith('fe80:')
  )
    return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  return false;
}

/** Returns a block reason, or `blocked: false` when the URL is safe to index. */
export function checkUrlGuardrails(
  url: string,
  options: GuardrailOptions = {},
): GuardrailResult {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { blocked: true, reason: 'INVALID_URL' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { blocked: true, reason: 'UNSUPPORTED_PROTOCOL' };
  }
  const host = u.hostname.toLowerCase();
  if (isPrivateHost(host)) return { blocked: true, reason: 'PRIVATE_HOST' };

  const domains = options.sensitiveDomains ?? DEFAULT_SENSITIVE_DOMAINS;
  if (domains.some(d => host === d || host.endsWith(`.${d}`))) {
    return { blocked: true, reason: 'SENSITIVE_DOMAIN' };
  }
  const paths = options.sensitivePaths ?? DEFAULT_SENSITIVE_PATHS;
  if (paths.some(re => re.test(u.pathname))) {
    return { blocked: true, reason: 'SENSITIVE_PATH' };
  }
  return { blocked: false };
}

export function isSensitiveOrUnsupportedUrl(
  url: string,
  options: GuardrailOptions = {},
): boolean {
  return checkUrlGuardrails(url, options).blocked;
}
