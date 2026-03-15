/** Resolve asset paths relative to Vite's configured base URL. */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  // Avoid double slashes
  if (path.startsWith('/')) path = path.slice(1);
  return base.endsWith('/') ? base + path : base + '/' + path;
}
