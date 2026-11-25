/**
 * Reads the asset tag out of what a QR code holds. Tags can be printed as the bare code
 * ("INV-00417") or as a link that ends in it ("https://…/a/INV-00417").
 * Returns null when nothing looks like a tag.
 */
export function tagFromQr(data: string): string | null {
  const text = data.trim();
  if (!text) return null;
  let candidate = text;
  if (/^https?:\/\//i.test(text)) {
    const path = text.replace(/[?#].*$/, '').replace(/\/+$/, '');
    candidate = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
  }
  candidate = candidate.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{1,39}$/.test(candidate) ? candidate : null;
}

/** Null when the typed tag can be looked up, otherwise what to fix. */
export function tagProblem(typed: string): string | null {
  const t = typed.trim();
  if (!t) return 'Type the code printed under the QR tag first.';
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,39}$/.test(t)) return 'Use letters, digits and dashes only, like INV-00417.';
  return null;
}
