/**
 * Wikilink resolution and content transformation for Phase 3.
 *
 * Resolves [[Note]], [[Note|Alias]], [[Note#Heading]], [[Note#Heading|Alias]],
 * and [[Note#^block-id]] wikilinks into standard Markdown links using the
 * target-public page index built from @fea-docs/normalizer discovery output.
 *
 * MDX safety: wikilinks inside fenced code blocks, inline code, and
 * import/export lines are left untouched.
 */

import type { FeaDocsGraphEdge } from '@fea-docs/schema';
import { textToAnchor } from './metadata.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lightweight page descriptor used for link resolution. */
export interface PageRef {
  /** Vault-relative source path, e.g. 'engineering/architecture.md' */
  relativePath: string;
  /** Route produced by routeFor(), e.g. '/engineering/architecture' */
  route: string;
  /** Resolved page title */
  title: string;
  /** Frontmatter aliases for this page */
  aliases: string[];
  /** Extracted headings with text and anchor */
  headings: Array<{ text: string; anchor: string }>;
  /** Obsidian block IDs present in this page (without the leading ^) */
  blockIds: string[];
}

/** Pre-built resolution index for efficient wikilink lookup. */
export interface PageIndex {
  /** All target-public pages available for resolution. */
  all: PageRef[];
  /** Normalized path (without extension, lowercase, slash-separated) → pages. */
  byNormalizedPath: Map<string, PageRef[]>;
  /** Normalized basename (lowercase) → pages. */
  byBasename: Map<string, PageRef[]>;
  /** Normalized title (lowercase) → pages. */
  byTitle: Map<string, PageRef[]>;
  /** Normalized alias (lowercase) → pages. */
  byAlias: Map<string, PageRef[]>;
}

export type ResolutionStatus = 'resolved' | 'unresolved' | 'ambiguous';

export interface ResolvedWikilink {
  status: 'resolved';
  page: PageRef;
  /** The HTML anchor fragment, including '#', or empty string if no fragment. */
  fragment: string;
  /** The final display text for the link. */
  displayText: string;
}

export interface UnresolvedWikilink {
  status: 'unresolved';
  /** Raw target string from the wikilink. */
  rawTarget: string;
  displayText: string;
}

export interface AmbiguousWikilink {
  status: 'ambiguous';
  rawTarget: string;
  matches: PageRef[];
  displayText: string;
}

export type WikilinkResolution = ResolvedWikilink | UnresolvedWikilink | AmbiguousWikilink;

/** One wikilink occurrence found in a source file. */
export interface WikilinkOccurrence {
  /** The full wikilink text, e.g. '[[Note#Heading|Alias]]' */
  raw: string;
  /** The target note identifier, e.g. 'Note' or 'path/Note' */
  target: string;
  /** Optional fragment: heading text or '^block-id' */
  fragment: string | null;
  /** Optional pipe-alias display text */
  pipeAlias: string | null;
}

/** Diagnostic emitted during wikilink transformation. */
export interface WikilinkDiagnostic {
  code: 'UNRESOLVED_WIKILINK' | 'AMBIGUOUS_WIKILINK';
  severity: 'warning' | 'error';
  message: string;
  sourcePath: string;
  suggestion: string;
  location?: { line: number };
}

/** Result of transforming a single page's wikilinks. */
export interface TransformResult {
  /** Transformed Markdown/MDX content. */
  content: string;
  /** Graph edges discovered from resolved wikilinks. */
  edges: FeaDocsGraphEdge[];
  /** Diagnostics for unresolved or ambiguous wikilinks. */
  diagnostics: WikilinkDiagnostic[];
}

// ---------------------------------------------------------------------------
// Page index construction
// ---------------------------------------------------------------------------

/**
 * Build an efficient lookup index from the given target-public pages.
 * Used by resolveWikilink() to find matches by path, title, or alias.
 */
export function buildPageIndex(pages: PageRef[]): PageIndex {
  const byNormalizedPath = new Map<string, PageRef[]>();
  const byBasename = new Map<string, PageRef[]>();
  const byTitle = new Map<string, PageRef[]>();
  const byAlias = new Map<string, PageRef[]>();

  for (const page of pages) {
    // Normalised path without extension and lowercase.
    const normalizedPath = page.relativePath
      .replace(/\\/g, '/')
      .replace(/\.(md|mdx)$/i, '')
      .toLowerCase();
    push(byNormalizedPath, normalizedPath, page);

    // Basename only (last segment of the path).
    const basename = normalizedPath.split('/').pop()!;
    push(byBasename, basename, page);

    // Title (case-insensitive).
    const titleKey = page.title.toLowerCase().trim();
    push(byTitle, titleKey, page);

    // Each alias (case-insensitive).
    for (const alias of page.aliases) {
      const aliasKey = alias.toLowerCase().trim();
      push(byAlias, aliasKey, page);
    }
  }

  return { all: pages, byNormalizedPath, byBasename, byTitle, byAlias };
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
  } else {
    map.set(key, [value]);
  }
}

// ---------------------------------------------------------------------------
// Wikilink resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a single wikilink target to a page from the index.
 *
 * Resolution order (first match wins):
 *   1. Exact normalised path match (e.g. 'engineering/architecture')
 *   2. Basename match (e.g. 'architecture' matches 'engineering/architecture.md')
 *   3. Title match (case-insensitive)
 *   4. Alias match (case-insensitive)
 *
 * Returns 'ambiguous' if multiple pages match at the same priority level.
 */
export function resolveWikilink(occurrence: WikilinkOccurrence, index: PageIndex): WikilinkResolution {
  const raw = occurrence.target.trim();
  const normalizedTarget = raw
    .replace(/\\/g, '/')
    .replace(/\.(md|mdx)$/i, '')
    .toLowerCase()
    .trim();
  const basename = normalizedTarget.split('/').pop()!;

  // The pipe alias is display-text-only — it is not used for resolution.
  const pipeAlias = occurrence.pipeAlias?.trim() ?? null;

  // Resolve the fragment into an HTML anchor.
  const fragmentStr = occurrence.fragment?.trim() ?? null;

  // Try resolution in priority order.
  const candidate = tryResolve(byNormalizedPath(index, normalizedTarget))
    ?? tryResolve(byBasename(index, basename))
    ?? tryResolve(byTitle(index, normalizedTarget))
    ?? tryResolve(byAlias(index, normalizedTarget));

  if (!candidate) {
    // Might be ambiguous at one of the levels.
    const ambiguous = tryAmbiguous(byNormalizedPath(index, normalizedTarget))
      ?? tryAmbiguous(byBasename(index, basename))
      ?? tryAmbiguous(byTitle(index, normalizedTarget))
      ?? tryAmbiguous(byAlias(index, normalizedTarget));

    if (ambiguous) {
      const displayText = pipeAlias ?? raw;
      return { status: 'ambiguous', rawTarget: raw, matches: ambiguous, displayText };
    }

    const displayText = pipeAlias ?? raw;
    return { status: 'unresolved', rawTarget: raw, displayText };
  }

  // Resolve the fragment.
  const fragment = resolveFragment(fragmentStr, candidate);

  // Compute display text: pipe alias > heading text (if heading fragment) > page title.
  let displayText: string;
  if (pipeAlias) {
    displayText = pipeAlias;
  } else if (fragmentStr && !fragmentStr.startsWith('^')) {
    // Heading fragment — show "Page § Heading" or just the heading text to keep it readable.
    displayText = fragmentStr;
  } else if (fragmentStr?.startsWith('^')) {
    displayText = candidate.title;
  } else {
    displayText = candidate.title;
  }

  return { status: 'resolved', page: candidate, fragment, displayText };
}

function byNormalizedPath(index: PageIndex, key: string): PageRef[] {
  return index.byNormalizedPath.get(key) ?? [];
}
function byBasename(index: PageIndex, key: string): PageRef[] {
  return index.byBasename.get(key) ?? [];
}
function byTitle(index: PageIndex, key: string): PageRef[] {
  return index.byTitle.get(key) ?? [];
}
function byAlias(index: PageIndex, key: string): PageRef[] {
  return index.byAlias.get(key) ?? [];
}

/** Returns the single page if exactly one candidate exists, otherwise null. */
function tryResolve(candidates: PageRef[]): PageRef | null {
  return candidates.length === 1 ? candidates[0] : null;
}

/** Returns the candidates if multiple exist, otherwise null (ambiguous check). */
function tryAmbiguous(candidates: PageRef[]): PageRef[] | null {
  return candidates.length > 1 ? candidates : null;
}

/**
 * Resolve a wikilink fragment string (heading text or ^block-id) to an HTML anchor.
 * Returns a string beginning with '#', or empty string if no fragment.
 */
function resolveFragment(fragment: string | null, page: PageRef): string {
  if (!fragment) return '';

  // Block ID fragment: [[Note#^block-id]]
  if (fragment.startsWith('^')) {
    const blockId = fragment.slice(1).trim();
    // Verify the block ID exists in the page (best-effort).
    // Even if not found, we still generate the link — the anchor may not scroll
    // correctly until Phase 6 injects the <span id> into the content.
    return `#${blockId}`;
  }

  // Heading fragment: [[Note#Heading Text]] — find the matching anchor.
  const fragmentLower = fragment.toLowerCase().trim();
  const heading = page.headings.find(
    (h) => h.text.toLowerCase() === fragmentLower || h.anchor === textToAnchor(fragment),
  );
  if (heading) {
    return `#${heading.anchor}`;
  }

  // Fragment not found in headings — fall back to computed anchor and let
  // the renderer surface the broken link. Development warnings cover this.
  return `#${textToAnchor(fragment)}`;
}

// ---------------------------------------------------------------------------
// Content transformation
// ---------------------------------------------------------------------------

/**
 * Regex matching a single wikilink: [[target]] or [[target#frag|display]]
 * Negative lookbehind (?<!!) excludes Obsidian embed syntax ![[...]] which
 * is handled separately by the embed transformer (Phase 6).
 */
const WIKILINK_RE = /(?<!!)(\[\[([^#|\][\n]+?)(?:#([^|\]\n]+?))?(?:\|([^\]\n]+?))?\]\])/g;

/**
 * Parse raw wikilinks from a string (without applying MDX protection).
 * Used by transformWikilinks internally and also exposed for unit testing.
 */
export function parseWikilinks(text: string): WikilinkOccurrence[] {
  const results: WikilinkOccurrence[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(WIKILINK_RE.source, 'g');
  while ((match = re.exec(text)) !== null) {
    results.push({
      raw: match[0],   // full match [[...]] (no leading ! due to lookbehind)
      target: match[2], // group 2: target note identifier
      fragment: match[3] ?? null, // group 3: heading or block fragment
      pipeAlias: match[4] ?? null, // group 4: pipe display alias
    });
  }
  return results;
}

/**
 * Transform all wikilinks in a page's content into standard Markdown links.
 *
 * MDX safety guarantees:
 *  - Content inside fenced code blocks (``` or ~~~) is never modified.
 *  - Content inside inline code spans (`...`) is never modified.
 *  - Lines beginning with `import ` or `export ` are never modified (MDX ESM).
 *
 * @param content       Raw source content of the page being normalised.
 * @param sourcePath    Vault-relative path of the source file (for diagnostics).
 * @param fromRoute     Route of the page being normalised (for graph edges).
 * @param index         Pre-built page index for resolution.
 * @param strict        Whether to emit errors instead of warnings.
 */
export function transformWikilinks(
  content: string,
  sourcePath: string,
  fromRoute: string,
  index: PageIndex,
  strict: boolean,
): TransformResult {
  const edges: FeaDocsGraphEdge[] = [];
  const diagnostics: WikilinkDiagnostic[] = [];

  // Split content into lines for processing, preserving line endings.
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
        fenceMarker = fenceMatch[1][0]; // '`' or '~'
        outputLines.push(line);
        continue;
      } else if (line.startsWith(fenceMarker.repeat(3))) {
        inFencedBlock = false;
        fenceMarker = '';
        outputLines.push(line);
        continue;
      }
    }

    // Inside a fenced code block — copy as-is.
    if (inFencedBlock) {
      outputLines.push(line);
      continue;
    }

    // MDX import/export lines — copy as-is.
    if (/^(import|export)\s/.test(line)) {
      outputLines.push(line);
      continue;
    }

    // Process the line with inline-code protection.
    outputLines.push(transformLine(line, lineIndex + 1, sourcePath, fromRoute, index, strict, edges, diagnostics));
  }

  return {
    content: outputLines.join('\n'),
    edges,
    diagnostics,
  };
}

/**
 * Transform wikilinks within a single line, protecting inline code spans.
 */
function transformLine(
  line: string,
  lineNumber: number,
  sourcePath: string,
  fromRoute: string,
  index: PageIndex,
  strict: boolean,
  edges: FeaDocsGraphEdge[],
  diagnostics: WikilinkDiagnostic[],
): string {
  // Split the line into [non-code, code, non-code, code, ...] segments.
  // Odd-indexed segments are inline code spans.
  const segments = line.split(/(`[^`\n]*`)/);

  return segments
    .map((segment, idx) => {
      // Even-indexed segments are regular text — process wikilinks here.
      if (idx % 2 === 0) {
        return replaceWikilinks(segment, lineNumber, sourcePath, fromRoute, index, strict, edges, diagnostics);
      }
      // Odd-indexed segments are inline code — return verbatim.
      return segment;
    })
    .join('');
}

/**
 * Replace all wikilinks in a text segment with Markdown links.
 */
function replaceWikilinks(
  text: string,
  lineNumber: number,
  sourcePath: string,
  fromRoute: string,
  index: PageIndex,
  strict: boolean,
  edges: FeaDocsGraphEdge[],
  diagnostics: WikilinkDiagnostic[],
): string {
  return text.replace(WIKILINK_RE, (raw, _fullGroup, target, fragment, pipeAlias) => {
    const occurrence: WikilinkOccurrence = {
      raw,
      target,
      fragment: fragment ?? null,
      pipeAlias: pipeAlias ?? null,
    };

    const resolution = resolveWikilink(occurrence, index);

    if (resolution.status === 'resolved') {
      const routeWithSlash = resolution.page.route.endsWith('/')
        ? resolution.page.route
        : `${resolution.page.route}/`;
      const href = resolution.fragment ? `${routeWithSlash}${resolution.fragment}` : routeWithSlash;
      edges.push({
        source: fromRoute,
        target: resolution.page.route,
        type: 'wikilink',
      });
      return `[${resolution.displayText}](${href})`;
    }

    if (resolution.status === 'ambiguous') {
      const matchList = resolution.matches.map((m) => m.relativePath).join(', ');
      diagnostics.push({
        code: 'AMBIGUOUS_WIKILINK',
        severity: strict ? 'error' : 'warning',
        message: `Ambiguous wikilink [[${target}]] matches multiple pages: ${matchList}`,
        sourcePath,
        suggestion: 'Use the full path to disambiguate, e.g. [[folder/Note]].',
        location: { line: lineNumber },
      });
      // Leave ambiguous wikilinks as-is so authors can see them.
      return raw;
    }

    // Unresolved.
    diagnostics.push({
      code: 'UNRESOLVED_WIKILINK',
      severity: strict ? 'error' : 'warning',
      message: `Unresolved wikilink [[${target}]] — no matching page found for the selected target.`,
      sourcePath,
      suggestion: `Check that the target page exists and is published to this target.`,
      location: { line: lineNumber },
    });
    return raw;
  });
}
