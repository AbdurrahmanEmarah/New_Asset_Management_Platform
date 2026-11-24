/** Mirrors the server's sub-domain rules so problems show while typing. The server still decides. */
const RESERVED = new Set(['admin', 'api', 'app', 'apps', 'auth', 'login', 'www', 'mail', 'static', 'assets', 'cdn', 'status', 'support', 'help', 'docs', 'billing', 'inventra', 'platform', 'staging', 'dev']);

export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(co|llc|ltd|inc|company|group|the)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
    .replace(/-$/, '');
}

export function slugProblem(slug: string): string | null {
  if (!slug) return 'Sub-domain is required.';
  if (slug.length < 3 || slug.length > 32) return 'Use 3 to 32 characters.';
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) return 'Use lowercase letters, numbers and dashes, starting and ending with a letter or number.';
  if (slug.includes('--')) return "Don't use two dashes in a row.";
  if (RESERVED.has(slug)) return `"${slug}" is reserved. Choose another sub-domain.`;
  return null;
}

export function emailProblem(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : "Enter the owner's email address, e.g. name@company.com.";
}
