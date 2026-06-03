export function normalizeBasePath(input?: string): string {
  const raw = (input ?? '/').trim();
  if (raw === '' || raw === '/') return '/';

  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const collapsedSlashes = withLeadingSlash.replace(/\/{2,}/g, '/');
  const withoutTrailingSlash = collapsedSlashes.replace(/\/+$/g, '');

  return withoutTrailingSlash || '/';
}

export function joinBasePath(base: string, pathname: string): string {
  const normalizedBase = normalizeBasePath(base);
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;

  if (normalizedBase === '/') return normalizedPathname;
  return `${normalizedBase}${normalizedPathname}`;
}
