import type { FeaDocsHeading } from '@fea-docs/schema';

export interface ExtractedMetadata {
  aliases: string[];
  slug: string | undefined;
  headings: FeaDocsHeading[];
  blockIds: string[];
  tags: string[];
  backlinks: boolean;
  pagefind: boolean;
  /** True when the title was derived from the filename rather than frontmatter or H1. */
  titleFromFilename: boolean;
}

/**
 * Derive page title from frontmatter, first H1, or filename (in that order).
 * Returns the title and whether it fell back to the filename.
 */
export function deriveTitle(
  frontmatter: Record<string, unknown>,
  content: string,
  relativePath: string,
): { title: string; titleFromFilename: boolean } {
  if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
    return { title: frontmatter.title.trim(), titleFromFilename: false };
  }
  // Strip fenced code blocks before scanning for H1 to avoid false matches inside code.
  const stripped = stripCodeBlocks(content);
  const h1 = stripped.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (h1) return { title: h1, titleFromFilename: false };
  const filename = relativePath
    .split('/')
    .pop()!
    .replace(/\.(md|mdx)$/i, '')
    .replace(/[-_]/g, ' ');
  return { title: filename, titleFromFilename: true };
}

/**
 * Extract all additional metadata from frontmatter and content.
 */
export function extractMetadata(
  frontmatter: Record<string, unknown>,
  content: string,
  relativePath: string,
): ExtractedMetadata {
  const { titleFromFilename } = deriveTitle(frontmatter, content, relativePath);

  // Aliases: frontmatter.aliases can be a string or string array.
  const rawAliases = frontmatter.aliases;
  const aliases: string[] = Array.isArray(rawAliases)
    ? rawAliases.filter((a): a is string => typeof a === 'string')
    : typeof rawAliases === 'string' && rawAliases.trim()
      ? [rawAliases.trim()]
      : [];

  // Slug from frontmatter.
  const slug = typeof frontmatter.slug === 'string' && frontmatter.slug.trim()
    ? frontmatter.slug.trim()
    : undefined;

  // Headings: parse Markdown ATX headings outside of code blocks.
  const headings = extractHeadings(content);

  // Block IDs: Obsidian-style ^block-id markers.
  const blockIds = extractBlockIds(content);

  // Tags: frontmatter.tags (string or array) + inline #tags.
  const tags = extractTags(frontmatter, content);

  // Backlinks: frontmatter.backlinks = true opts in.
  const backlinks = frontmatter.backlinks === true;

  // Pagefind: false to exclude; default true.
  const pagefind = frontmatter.pagefind !== false;

  return { aliases, slug, headings, blockIds, tags, backlinks, pagefind, titleFromFilename };
}

/**
 * Extract ATX headings from Markdown content, skipping fenced code blocks.
 */
function extractHeadings(content: string): FeaDocsHeading[] {
  const stripped = stripCodeBlocks(content);
  const headings: FeaDocsHeading[] = [];
  const anchorCounts = new Map<string, number>();

  for (const line of stripped.split('\n')) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    const text = match[2].trim();
    const baseAnchor = textToAnchor(text);
    const count = anchorCounts.get(baseAnchor) ?? 0;
    const anchor = count === 0 ? baseAnchor : `${baseAnchor}-${count}`;
    anchorCounts.set(baseAnchor, count + 1);
    headings.push({ level, text, anchor });
  }

  return headings;
}

/**
 * Convert heading text to a URL-safe anchor slug.
 * Exported so wikilink fragment resolution can reuse the same algorithm.
 */
export function textToAnchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-');
}

/**
 * Extract explicit Obsidian block IDs (^block-id at end of line).
 */
function extractBlockIds(content: string): string[] {
  const stripped = stripCodeBlocks(content);
  const ids: string[] = [];
  const re = /\s\^([A-Za-z0-9_-]+)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stripped)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

/**
 * Extract tags from frontmatter.tags and inline #tag syntax.
 */
function extractTags(frontmatter: Record<string, unknown>, content: string): string[] {
  const tags = new Set<string>();

  // Frontmatter tags.
  const rawTags = frontmatter.tags;
  if (Array.isArray(rawTags)) {
    for (const tag of rawTags) {
      if (typeof tag === 'string') tags.add(tag.trim());
    }
  } else if (typeof rawTags === 'string' && rawTags.trim()) {
    tags.add(rawTags.trim());
  }

  // Inline #tags outside code blocks.
  const stripped = stripCodeBlocks(content);
  const re = /(?:^|\s)#([A-Za-z][A-Za-z0-9_/-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stripped)) !== null) {
    tags.add(match[1]);
  }

  return Array.from(tags);
}

/**
 * Remove fenced code blocks from content to prevent false positives during extraction.
 */
function stripCodeBlocks(content: string): string {
  // Remove ``` and ~~~ fenced blocks (including with language specifiers).
  return content.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1\s*$/gm, '');
}
