/** The message to show for a failed action: the server's own words when it sent some. */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function initials(name: string): string {
  return name.split(/[\s@.]+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
