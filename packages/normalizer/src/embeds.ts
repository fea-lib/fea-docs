/**
 * Phase 6: Embeds and Transclusion
 *
 * Normalizes Obsidian-style embed syntax in Markdown/MDX content:
 *   ![[Note]]           → bounded embedded note content (blockquote with attribution)
 *   ![[Note#Heading]]   → targeted heading section content
 *   ![[Note#^block-id]] → targeted block content
 *   ![[asset.ext]]      → standard Markdown image syntax (for image/media assets)
 *
 * Privacy guarantees:
 *   - Private pages and cross-target pages cannot be embedded in public pages.
 *   - Recursive embed cycles are detected and reported.
 *   - Asset embeds respect target-public asset inclusion rules.
 *
 * MDX safety:
 *   - Embeds inside fenced code blocks and inline code are left untouched.
 *   - Lines beginning with `import ` or `export ` are left untouched.
 */

import path from 'node:path';
import matter from 'gray-matter';
import type { PageIndex } from './wikilinks.js';
import { resolveWikilink } from './wikilinks.js';
import { textToAnchor } from './metadata.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmbedDiagnostic {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  sourcePath: string;
  suggestion?: string;
  location?: { line: number };
}

export interface PageMetaForEmbed {
  relativePath: string;
  route: string;
  /** Configured targets this page is published to (empty = private). */
  publishTargets: string[];
  /** True when publish is false, undefined, or not a known target list. */
  isExplicitlyPrivate: boolean;
}

export interface EmbedExpandOptions {
  /** Vault-relative path of the page being processed. */
  sourcePath: string;
  /** Route of the page being processed (for diagnostics). */
  sourceRoute: string;
  /** The current publishing target ID. */
  targetId: string;
  /** Emit errors rather than warnings for recoverable issues. */
  strict: boolean;
  /**
   * Map from vault-relative path → transformed content (after wikilinks and
   * callouts have already been applied). Used to resolve note embeds.
   */
  transformedPages: Map<string, string>;
  /** Page index built from target-public pages only. */
  pageIndex: PageIndex;
  /**
   * Page index built from ALL vault pages (including private / other-target).
   * Used to classify unresolved embeds as private or cross-target.
   */
  allPageIndex?: PageIndex;
  /**
   * Metadata for ALL vault pages (including private / other-target pages),
   * keyed by vault-relative path. Used for privacy classification.
   */
  allPageMetaByPath: Map<string, PageMetaForEmbed>;
  /**
   * Set of vault-relative paths for all non-Markdown files discovered in the
   * vault. Used to validate asset embed references.
   */
  allStaticFilesSet: Set<string>;
  /**
   * Currently resolving stack (vault-relative paths). Passed recursively to
   * detect embed cycles.
   */
  resolvingStack?: string[];
  /**
   * Memoization cache keyed by vault-relative path. Maps a path to its
   * fully embed-expanded content so recursive embeds are only processed once.
   * Callers should create a single Map and thread it through all calls.
   */
  expandCache?: Map<string, string>;
}

export interface EmbedExpandResult {
  content: string;
  diagnostics: EmbedDiagnostic[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** File extensions treated as image/media assets for embed → img normalization. */
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif',
]);

const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.webm', '.ogg', '.mp3', '.wav',
]);

// ---------------------------------------------------------------------------
// Embed parsing
// ---------------------------------------------------------------------------

interface ParsedEmbed {
  /** Full raw syntax, e.g. `![[Note#Heading]]` */
  raw: string;
  /** Note identifier or asset path, e.g. `Note`, `path/to/Note`, `image.png` */
  target: string;
  /** Fragment: heading text or `^block-id`, or null */
  fragment: string | null;
}

const EMBED_RE = /!\[\[([^\]\n]+?)\]\]/g;

function parseEmbed(raw: string, inner: string): ParsedEmbed {
  const hashIdx = inner.indexOf('#');
  if (hashIdx === -1) {
    return { raw, target: inner.trim(), fragment: null };
  }
  return {
    raw,
    target: inner.slice(0, hashIdx).trim(),
    fragment: inner.slice(hashIdx + 1).trim() || null,
  };
}

// ---------------------------------------------------------------------------
// Asset resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an asset target (relative to the embedding page) into a
 * vault-relative path.
 */
function resolveAssetPath(
  assetTarget: string,
  embeddingPagePath: string,
): string {
  // If the target already starts with '/', treat as vault-root-relative.
  if (assetTarget.startsWith('/')) {
    return assetTarget.slice(1).replace(/\\/g, '/');
  }
  // Otherwise resolve relative to the embedding page's directory.
  const pageDir = path.posix.dirname(embeddingPagePath.replace(/\\/g, '/'));
  const resolved = path.posix.normalize(`${pageDir}/${assetTarget}`);
  // Remove leading ./ if present.
  return resolved.replace(/^\.\//, '');
}

// ---------------------------------------------------------------------------
// Content extraction helpers
// ---------------------------------------------------------------------------

/**
 * Strip YAML frontmatter from content and return the body only.
 */
function stripFrontmatter(content: string): string {
  try {
    const parsed = matter(content);
    return parsed.content.trim();
  } catch {
    return content.trim();
  }
}

/**
 * Extract the content of a specific heading section from Markdown text.
 *
 * Returns the content from the line after the matched heading until the next
 * heading of equal or higher level (or end of document).
 */
function extractHeadingSection(content: string, headingText: string): string | null {
  const lines = content.split('\n');
  const headingLower = headingText.toLowerCase().trim();

  let sectionDepth = 0;
  let inSection = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const depth = headingMatch[1].length;
      const text = headingMatch[2].trim().toLowerCase();

      if (inSection) {
        // If we hit a heading of equal or higher level, stop.
        if (depth <= sectionDepth) break;
        sectionLines.push(line);
      } else if (text === headingLower) {
        sectionDepth = depth;
        inSection = true;
        // Don't include the heading line itself — embed the body only.
      }
    } else if (inSection) {
      sectionLines.push(line);
    }
  }

  if (!inSection) return null;
  return sectionLines.join('\n').trim();
}

/**
 * Extract the block that contains an explicit Obsidian block ID (`^block-id`).
 *
 * Returns the paragraph/block ending with `^block-id`, with the marker
 * stripped from the output (the surrounding anchor is preserved by
 * injectBlockAnchors when the source page is processed).
 */
function extractBlockContent(content: string, blockId: string): string | null {
  const lines = content.split('\n');
  const markerRe = new RegExp(`\\^${escapeRegex(blockId)}\\s*$`);

  // Find the line containing the block ID marker.
  let markerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (markerRe.test(lines[i])) {
      markerLineIdx = i;
      break;
    }
  }

  if (markerLineIdx === -1) return null;

  // Walk backwards to collect the block (paragraph) that precedes the marker.
  // A block ends at an empty line or at the start of the document.
  const blockLines: string[] = [];
  for (let i = markerLineIdx; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed === '' && i !== markerLineIdx) break;
    blockLines.unshift(lines[i]);
  }

  // Strip the block ID marker from the last line.
  if (blockLines.length > 0) {
    blockLines[blockLines.length - 1] = blockLines[blockLines.length - 1]
      .replace(markerRe, '')
      .trimEnd();
  }

  return blockLines.join('\n').trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Block anchor injection
// ---------------------------------------------------------------------------

/**
 * Inject `<span id="block-id"></span>` anchors for all `^block-id` markers
 * found in the content, so that `[[Note#^block-id]]` links work correctly.
 *
 * The Obsidian marker `^block-id` at the end of a line is replaced by an
 * inline HTML anchor:
 *   `Some text. ^my-id` → `Some text. <span id="my-id"></span>`
 */
export function injectBlockAnchors(content: string): string {
  // Replace ^block-id at end-of-line (outside code blocks).
  const lines = content.split('\n');
  const output: string[] = [];
  let inFencedBlock = false;

  for (const line of lines) {
    if (/^[ \t]*(```|~~~)/.test(line)) {
      inFencedBlock = !inFencedBlock;
      output.push(line);
      continue;
    }
    if (inFencedBlock) {
      output.push(line);
      continue;
    }

    // Replace trailing ^block-id with a span anchor.
    const replaced = line.replace(/\s+\^([\w-]+)\s*$/, ' <span id="$1"></span>');
    output.push(replaced);
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// Main expand function
// ---------------------------------------------------------------------------

/**
 * Expand all `![[...]]` embed references in the given content.
 *
 * This is called in a second pass, after wikilinks and callouts have already
 * been transformed for all target-public pages.
 */
export function expandEmbeds(
  content: string,
  options: EmbedExpandOptions,
): EmbedExpandResult {
  const diagnostics: EmbedDiagnostic[] = [];
  const resolvingStack = options.resolvingStack ?? [];
  const expandCache = options.expandCache ?? new Map<string, string>();

  // Split content into lines for MDX safety tracking.
  const lines = content.split('\n');
  const outputLines: string[] = [];

  let inFencedBlock = false;
  let fenceMarker = '';

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    // Track fenced code block boundaries.
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!inFencedBlock) {
        inFencedBlock = true;
        fenceMarker = fenceMatch[1][0];
        outputLines.push(line);
        continue;
      } else if (line.startsWith(fenceMarker.repeat(3))) {
        inFencedBlock = false;
        fenceMarker = '';
        outputLines.push(line);
        continue;
      }
    }

    if (inFencedBlock) {
      outputLines.push(line);
      continue;
    }

    // MDX import/export lines — copy as-is.
    if (/^(import|export)\s/.test(line)) {
      outputLines.push(line);
      continue;
    }

    // Process the line — protect inline code spans.
    const processedLine = expandEmbedsInLine(
      line,
      lineIndex + 1,
      diagnostics,
      resolvingStack,
      expandCache,
      options,
    );
    outputLines.push(processedLine);
  }

  return { content: outputLines.join('\n'), diagnostics };
}

/**
 * Expand embeds within a single line, protecting inline code spans.
 */
function expandEmbedsInLine(
  line: string,
  lineNumber: number,
  diagnostics: EmbedDiagnostic[],
  resolvingStack: string[],
  expandCache: Map<string, string>,
  options: EmbedExpandOptions,
): string {
  // Split into [text, `code`, text, `code`, ...] segments.
  const segments = line.split(/(`[^`\n]*`)/);
  return segments
    .map((segment, idx) => {
      if (idx % 2 !== 0) return segment; // inline code — leave untouched
      return replaceEmbedsInSegment(segment, lineNumber, diagnostics, resolvingStack, expandCache, options);
    })
    .join('');
}

function replaceEmbedsInSegment(
  text: string,
  lineNumber: number,
  diagnostics: EmbedDiagnostic[],
  resolvingStack: string[],
  expandCache: Map<string, string>,
  options: EmbedExpandOptions,
): string {
  return text.replace(EMBED_RE, (raw, inner) => {
    const embed = parseEmbed(raw, inner);
    return resolveEmbed(embed, lineNumber, diagnostics, resolvingStack, expandCache, options);
  });
}

// ---------------------------------------------------------------------------
// Embed resolution
// ---------------------------------------------------------------------------

function resolveEmbed(
  embed: ParsedEmbed,
  lineNumber: number,
  diagnostics: EmbedDiagnostic[],
  resolvingStack: string[],
  expandCache: Map<string, string>,
  options: EmbedExpandOptions,
): string {
  const { target, fragment } = embed;

  // -------------------------------------------------------------------------
  // 1. Asset embed detection — target has a non-Markdown file extension.
  // -------------------------------------------------------------------------
  const ext = path.posix.extname(target).toLowerCase();
  if (ext && ext !== '.md' && ext !== '.mdx') {
    return resolveAssetEmbed(embed, lineNumber, diagnostics, options);
  }

  // -------------------------------------------------------------------------
  // 2. Note / heading / block embed.
  // -------------------------------------------------------------------------
  return resolveNoteEmbed(embed, lineNumber, diagnostics, resolvingStack, expandCache, options);
}

// ---------------------------------------------------------------------------
// Asset embed resolution
// ---------------------------------------------------------------------------

function resolveAssetEmbed(
  embed: ParsedEmbed,
  lineNumber: number,
  diagnostics: EmbedDiagnostic[],
  options: EmbedExpandOptions,
): string {
  const { target } = embed;
  const ext = path.posix.extname(target).toLowerCase();

  // Try resolving by relative path first.
  let resolvedPath = resolveAssetPath(target, options.sourcePath);

  // If the relative path is not found but the target has no directory component,
  // try vault-wide basename lookup (Obsidian short-name style).
  if (!options.allStaticFilesSet.has(resolvedPath) && !target.includes('/') && !target.includes('\\')) {
    const basename = path.posix.basename(target);
    const basenameMatch = Array.from(options.allStaticFilesSet).find(
      (f) => path.posix.basename(f) === basename,
    );
    if (basenameMatch) {
      resolvedPath = basenameMatch;
    }
  }

  // Check if the asset exists in the vault.
  if (!options.allStaticFilesSet.has(resolvedPath)) {
    diagnostics.push({
      code: 'UNRESOLVED_EMBED_ASSET',
      severity: options.strict ? 'error' : 'warning',
      message: `Asset embed ![[${target}]] in "${options.sourcePath}" could not be resolved — file not found.`,
      sourcePath: options.sourcePath,
      suggestion: 'Check that the asset file exists and is not excluded by ignore patterns.',
      location: { line: lineNumber },
    });
    return embed.raw; // leave as-is so authors can see it
  }

  // Compute relative path from the embedding page to the asset.
  const pageDir = path.posix.dirname(options.sourcePath.replace(/\\/g, '/'));
  const relToPage = path.posix.relative(pageDir, resolvedPath);
  const relHref = relToPage.startsWith('.') ? relToPage : `./${relToPage}`;

  const altText = path.posix.basename(target, ext);

  if (IMAGE_EXTENSIONS.has(ext)) {
    return `![${altText}](${relHref})`;
  }

  if (MEDIA_EXTENSIONS.has(ext)) {
    // For media, emit a link (no native Markdown audio/video syntax).
    return `[${altText}](${relHref})`;
  }

  // Generic file link.
  return `[${altText}](${relHref})`;
}

// ---------------------------------------------------------------------------
// Note embed resolution
// ---------------------------------------------------------------------------

function resolveNoteEmbed(
  embed: ParsedEmbed,
  lineNumber: number,
  diagnostics: EmbedDiagnostic[],
  resolvingStack: string[],
  expandCache: Map<string, string>,
  options: EmbedExpandOptions,
): string {
  const { target, fragment } = embed;

  // Resolve the target note using the same logic as wikilinks.
  const occurrence = {
    raw: embed.raw,
    target,
    fragment: null, // resolve page first, then extract fragment from content
    pipeAlias: null,
  };

  const resolution = resolveWikilink(occurrence, options.pageIndex);

  if (resolution.status === 'ambiguous') {
    const matchList = resolution.matches.map((m) => m.relativePath).join(', ');
    diagnostics.push({
      code: 'AMBIGUOUS_EMBED',
      severity: options.strict ? 'error' : 'warning',
      message: `Ambiguous embed ![[${target}]] matches multiple pages: ${matchList}.`,
      sourcePath: options.sourcePath,
      suggestion: 'Use the full path to disambiguate, e.g. ![[folder/Note]].',
      location: { line: lineNumber },
    });
    return embed.raw;
  }

  if (resolution.status === 'unresolved') {
    // Check if the target resolves in the full (all-pages) index — if so it's
    // a private/cross-target reference rather than a genuinely missing page.
    if (options.allPageIndex) {
      const allResolution = resolveWikilink(occurrence, options.allPageIndex);
      if (allResolution.status === 'resolved') {
        const meta = options.allPageMetaByPath.get(allResolution.page.relativePath);
        if (meta) {
          if (meta.isExplicitlyPrivate || meta.publishTargets.length === 0) {
            diagnostics.push({
              code: 'PRIVATE_EMBED',
              severity: options.strict ? 'error' : 'warning',
              message: `Embed ![[${target}]] in "${options.sourcePath}" references a private page "${allResolution.page.relativePath}" not published to any target.`,
              sourcePath: options.sourcePath,
              suggestion: 'Add the embedded page to a configured publishing target or remove the embed.',
              location: { line: lineNumber },
            });
            return embed.raw;
          }
          if (!meta.publishTargets.includes(options.targetId)) {
            diagnostics.push({
              code: 'CROSS_TARGET_EMBED',
              severity: options.strict ? 'error' : 'warning',
              message: `Embed ![[${target}]] in "${options.sourcePath}" references a cross-target page "${allResolution.page.relativePath}" (published to: ${meta.publishTargets.join(', ')}).`,
              sourcePath: options.sourcePath,
              suggestion: `Add "${options.targetId}" to the embedded page's publish frontmatter or remove the embed.`,
              location: { line: lineNumber },
            });
            return embed.raw;
          }
        }
      }
    }

    diagnostics.push({
      code: 'UNRESOLVED_EMBED',
      severity: options.strict ? 'error' : 'warning',
      message: `Unresolved embed ![[${target}]] in "${options.sourcePath}" — no matching page found for the selected target.`,
      sourcePath: options.sourcePath,
      suggestion: 'Check that the target page exists and is published to this target.',
      location: { line: lineNumber },
    });
    return embed.raw;
  }

  // status === 'resolved'
  const resolvedPage = resolution.page;

  // -------------------------------------------------------------------------
  // Privacy check — the resolved page must be public for the current target.
  // -------------------------------------------------------------------------
  const meta = options.allPageMetaByPath.get(resolvedPage.relativePath);
  if (meta) {
    if (meta.isExplicitlyPrivate || meta.publishTargets.length === 0) {
      diagnostics.push({
        code: 'PRIVATE_EMBED',
        severity: options.strict ? 'error' : 'warning',
        message: `Embed ![[${target}]] in "${options.sourcePath}" references a private page "${resolvedPage.relativePath}" not published to any target.`,
        sourcePath: options.sourcePath,
        suggestion: 'Add the embedded page to a configured publishing target or remove the embed.',
        location: { line: lineNumber },
      });
      return embed.raw;
    }
    if (!meta.publishTargets.includes(options.targetId)) {
      diagnostics.push({
        code: 'CROSS_TARGET_EMBED',
        severity: options.strict ? 'error' : 'warning',
        message: `Embed ![[${target}]] in "${options.sourcePath}" references a cross-target page "${resolvedPage.relativePath}" (published to: ${meta.publishTargets.join(', ')}).`,
        sourcePath: options.sourcePath,
        suggestion: `Add "${options.targetId}" to the embedded page's publish frontmatter or remove the embed.`,
        location: { line: lineNumber },
      });
      return embed.raw;
    }
  }

  // -------------------------------------------------------------------------
  // Cycle detection.
  // -------------------------------------------------------------------------
  if (resolvingStack.includes(resolvedPage.relativePath)) {
    const cycle = [...resolvingStack, resolvedPage.relativePath].join(' → ');
    diagnostics.push({
      code: 'EMBED_CYCLE',
      severity: 'error',
      message: `Recursive embed cycle detected: ${cycle}.`,
      sourcePath: options.sourcePath,
      suggestion: 'Remove the circular embed reference.',
      location: { line: lineNumber },
    });
    return `<!-- embed cycle: ![[${target}]] -->`;
  }

  // -------------------------------------------------------------------------
  // Retrieve (and recursively expand) the embedded page's content.
  // -------------------------------------------------------------------------
  let embeddedContent: string;
  if (expandCache.has(resolvedPage.relativePath)) {
    embeddedContent = expandCache.get(resolvedPage.relativePath)!;
  } else {
    const rawTransformed = options.transformedPages.get(resolvedPage.relativePath);
    if (!rawTransformed) {
      // Content not available — this shouldn't happen if transformedPages is
      // built correctly, but handle it gracefully.
      diagnostics.push({
        code: 'UNRESOLVED_EMBED',
        severity: options.strict ? 'error' : 'warning',
        message: `Embed ![[${target}]] — transformed content for "${resolvedPage.relativePath}" not available.`,
        sourcePath: options.sourcePath,
        suggestion: 'This is an internal normalizer error; please report it.',
        location: { line: lineNumber },
      });
      return embed.raw;
    }

    // Recursively expand embeds within the embedded page's content.
    const nestedResult = expandEmbeds(rawTransformed, {
      ...options,
      sourcePath: resolvedPage.relativePath,
      sourceRoute: resolvedPage.route,
      resolvingStack: [...resolvingStack, options.sourcePath],
      expandCache,
    });
    // Propagate nested diagnostics.
    diagnostics.push(...nestedResult.diagnostics);
    embeddedContent = nestedResult.content;
    expandCache.set(resolvedPage.relativePath, embeddedContent);
  }

  // Strip frontmatter from the embedded content.
  const body = stripFrontmatter(embeddedContent);

  // -------------------------------------------------------------------------
  // Fragment extraction: heading or block.
  // -------------------------------------------------------------------------
  if (fragment) {
    if (fragment.startsWith('^')) {
      // Block embed: ![[Note#^block-id]]
      const blockId = fragment.slice(1).trim();
      const blockContent = extractBlockContent(body, blockId);
      if (!blockContent) {
        diagnostics.push({
          code: 'UNRESOLVED_BLOCK_EMBED',
          severity: options.strict ? 'error' : 'warning',
          message: `Block embed ![[${target}#^${blockId}]] — block ID "^${blockId}" not found in "${resolvedPage.relativePath}".`,
          sourcePath: options.sourcePath,
          suggestion: `Add a ^${blockId} marker to the target page or correct the block ID.`,
          location: { line: lineNumber },
        });
        return embed.raw;
      }
      const routeWithSlash = resolvedPage.route.endsWith('/')
        ? resolvedPage.route
        : `${resolvedPage.route}/`;
      return renderBoundedEmbed(blockContent, resolvedPage.title, `${routeWithSlash}#${blockId}`);
    } else {
      // Heading embed: ![[Note#Heading]]
      const sectionContent = extractHeadingSection(body, fragment);
      if (!sectionContent) {
        diagnostics.push({
          code: 'UNRESOLVED_HEADING_EMBED',
          severity: options.strict ? 'error' : 'warning',
          message: `Heading embed ![[${target}#${fragment}]] — heading "${fragment}" not found in "${resolvedPage.relativePath}".`,
          sourcePath: options.sourcePath,
          suggestion: `Check that the heading exists in the target page.`,
          location: { line: lineNumber },
        });
        return embed.raw;
      }
      const routeWithSlash = resolvedPage.route.endsWith('/')
        ? resolvedPage.route
        : `${resolvedPage.route}/`;
      const anchor = textToAnchor(fragment);
      return renderBoundedEmbed(sectionContent, resolvedPage.title, `${routeWithSlash}#${anchor}`);
    }
  }

  // Full note embed: ![[Note]]
  const routeWithSlash = resolvedPage.route.endsWith('/')
    ? resolvedPage.route
    : `${resolvedPage.route}/`;
  return renderBoundedEmbed(body, resolvedPage.title, routeWithSlash);
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Render a bounded embedded content block with an attribution link.
 *
 * Uses a Markdown blockquote with a header line so the embed is visually
 * distinct and accessible without requiring MDX component syntax.
 */
function renderBoundedEmbed(body: string, title: string, href: string): string {
  // Indent each body line with "> " to render as a blockquote.
  const indented = body
    .split('\n')
    .map((l) => (l.trim() === '' ? '>' : `> ${l}`))
    .join('\n');

  return `> **Embedded from [${title}](${href})**\n>\n${indented}`;
}
