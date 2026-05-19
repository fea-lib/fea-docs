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
  return stem.replace(/[-_]/g, ' ');
}

/**
 * Inject a `title` field into the raw file content if one is not already
 * present in the frontmatter.
 *
 * - If a frontmatter block exists, `title: <label>` is inserted as the first
 *   key inside it.
 * - If no frontmatter block exists, a minimal `---\ntitle: <label>\n---\n`
 *   block is prepended.
 *
 * The file on disk is written only when a change is actually needed.
 */
export function injectFrontmatterTitle(absolutePath: string, raw: string, label: string): string {
  const { data: frontmatter } = matter(raw);
  if (typeof frontmatter['title'] === 'string' && frontmatter['title'].trim()) {
    return raw;
  }

  const escapedLabel = label.replace(/'/g, "''");
  const titleLine = `title: '${escapedLabel}'`;

  let updated: string;
  const hasFrontmatter = /^---[ \t]*\r?\n/.test(raw);
  if (hasFrontmatter) {
    updated = raw.replace(/^(---[ \t]*\r?\n)/, `$1${titleLine}\n`);
  } else {
    updated = `---\n${titleLine}\n---\n\n${raw}`;
  }

  fs.writeFileSync(absolutePath, updated, 'utf-8');
  return updated;
}

/**
 * Parse a single file and return a DocPage.
 * If the file lacks a `title` in its frontmatter, one is injected into the
 * source file on disk before the DocPage is returned.
 */
export function parseDocFile(absolutePath: string, relativePath: string): DocPage {
  let raw = fs.readFileSync(absolutePath, 'utf-8');
  const { data: frontmatter, content } = matter(raw);

  const ext = absolutePath.endsWith('.mdx') ? 'mdx' : 'md';
  const basename = path.basename(relativePath);
  const isSectionIndex =
    basename === 'README.md' || basename === 'README.mdx' || basename === 'readme.md';

  const label = deriveLabel(frontmatter, content, relativePath);
  // entryId: what Starlight's Content Layer glob() loader uses as the URL path.
  const entryId = relativePath
    .replace(/\\/g, '/')
    .replace(/\.(md|mdx)$/, '')
    .toLowerCase();

  raw = injectFrontmatterTitle(absolutePath, raw, label);
  const updatedFrontmatter = matter(raw).data;

  return {
    absolutePath,
    relativePath,
    entryId,
    label,
    frontmatter: updatedFrontmatter,
    isSectionIndex,
    ext,
  };
}

/**
 * Validate that no two pages share the same entryId (URL path).
 */
export function findDuplicateEntryIds(
  pages: DocPage[],
): Array<{ entryId: string; pages: DocPage[] }> {
  const byEntryId = new Map<string, DocPage[]>();
  for (const page of pages) {
    const group = byEntryId.get(page.entryId) ?? [];
    group.push(page);
    byEntryId.set(page.entryId, group);
  }
  return Array.from(byEntryId.entries())
    .filter(([, pages]) => pages.length > 1)
    .map(([entryId, pages]) => ({ entryId, pages }));
}

export { DocsGraph };
