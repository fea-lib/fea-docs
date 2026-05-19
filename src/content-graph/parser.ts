import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { DocPage, DocsGraph } from '../types.js';

/**
 * Extract the first H1 heading from raw Markdown/MDX content.
 */
export function extractFirstH1(content: string): string | undefined {
  const match = content.match(/^#{1}\s+(.+)$/m);
  return match ? match[1].trim() : undefined;
}

/**
 * Derive a stable slug from a relative file path.
 * - Strips file extension
 * - Lowercases
 * - Replaces spaces/underscores with hyphens
 * - README -> '' (section index at directory level)
 */
export function deriveSlug(relativePath: string, slugOverrides?: Record<string, string>): string {
  if (slugOverrides && relativePath in slugOverrides) {
    return slugOverrides[relativePath];
  }

  // Normalize separators
  let slug = relativePath.replace(/\\/g, '/');

  // Strip extension
  slug = slug.replace(/\.(md|mdx)$/, '');

  // Handle README as section index
  if (slug === 'README' || slug.endsWith('/README')) {
    slug = slug.replace(/\/?README$/, '');
  }

  // Lowercase and replace spaces/underscores with hyphens
  slug = slug
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9/\-.]/g, '');

  return slug || '/';
}

/**
 * Derive a human-readable label for a page.
 * Priority: frontmatter title -> first H1 -> filename stem.
 */
export function deriveLabel(
  frontmatter: Record<string, unknown>,
  content: string,
  relativePath: string,
): string {
  // 1. Frontmatter title
  if (typeof frontmatter['title'] === 'string' && frontmatter['title'].trim()) {
    return frontmatter['title'].trim();
  }

  // 2. First H1
  const h1 = extractFirstH1(content);
  if (h1) return h1;

  // 3. Filename stem
  const basename = path.basename(relativePath);
  const stem = basename.replace(/\.(md|mdx)$/, '');
  // Convert common separators to spaces for readability
  return stem.replace(/[-_]/g, ' ');
}

/**
 * Parse a single file and return a DocPage.
 */
export function parseDocFile(
  absolutePath: string,
  relativePath: string,
  slugOverrides?: Record<string, string>,
): DocPage {
  const raw = fs.readFileSync(absolutePath, 'utf-8');
  const { data: frontmatter, content } = matter(raw);

  const ext = absolutePath.endsWith('.mdx') ? 'mdx' : 'md';
  const basename = path.basename(relativePath);
  const isSectionIndex =
    basename === 'README.md' || basename === 'README.mdx' || basename === 'readme.md';

  const slug = deriveSlug(relativePath, slugOverrides);
  const label = deriveLabel(frontmatter, content, relativePath);

  return {
    absolutePath,
    relativePath,
    slug,
    label,
    frontmatter,
    isSectionIndex,
    ext,
  };
}

/**
 * Validate that no two pages share the same slug.
 * Returns an array of duplicate slug entries.
 */
export function findDuplicateSlugs(pages: DocPage[]): Array<{ slug: string; pages: DocPage[] }> {
  const bySlug = new Map<string, DocPage[]>();
  for (const page of pages) {
    const group = bySlug.get(page.slug) ?? [];
    group.push(page);
    bySlug.set(page.slug, group);
  }
  return Array.from(bySlug.entries())
    .filter(([, pages]) => pages.length > 1)
    .map(([slug, pages]) => ({ slug, pages }));
}

export { DocsGraph };
