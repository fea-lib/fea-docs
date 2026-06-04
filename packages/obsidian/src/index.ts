import type { SyntaxDocument, SyntaxHandler, SyntaxTransformResult } from '@fea-docs/syntax-engine';
import type { FeaDocsDiagnostic } from '@fea-docs/schema';

export interface ObsidianHandlersOptions {
  callouts?: boolean;
  embeds?: boolean;
  wikilinks?: boolean;
}

// ---------------------------------------------------------------------------
// Callout type → Starlight aside type mapping
// ---------------------------------------------------------------------------

type AsideType = 'note' | 'tip' | 'caution' | 'danger';

const CALLOUT_TYPE_MAP: Record<string, AsideType> = {
  note: 'note',
  abstract: 'note',
  summary: 'note',
  tldr: 'note',
  info: 'note',
  todo: 'note',
  tip: 'tip',
  hint: 'tip',
  important: 'tip',
  success: 'tip',
  check: 'tip',
  done: 'tip',
  question: 'note',
  help: 'note',
  faq: 'note',
  warning: 'caution',
  caution: 'caution',
  attention: 'caution',
  failure: 'caution',
  fail: 'caution',
  missing: 'caution',
  danger: 'danger',
  error: 'danger',
  bug: 'danger',
  example: 'note',
  quote: 'note',
  cite: 'note',
};

// ---------------------------------------------------------------------------
// Callout normalization
// ---------------------------------------------------------------------------

/**
 * Regex to match the opening line of an Obsidian callout:
 *   > [!type]            (no title, no foldable marker)
 *   > [!type]+           (foldable open, no custom title)
 *   > [!type]-           (foldable closed, no custom title)
 *   > [!type]+ Title     (foldable open, custom title)
 *   > [!type]- Title     (foldable closed, custom title)
 *   > [!type] Title      (fixed, custom title — non-standard but widely used)
 */
const CALLOUT_HEADER_RE = /^(>+)\s*\[!([^\]]+)\]([+-]?)\s*(.*)$/;

interface CalloutBlock {
  /** Nesting depth (number of `>` characters on header line) */
  depth: number;
  /** Normalised callout type key, e.g. "warning" */
  rawType: string;
  /** Foldable marker: '+', '-', or '' */
  foldable: string;
  /** Custom title provided by the author, or '' */
  customTitle: string;
  /** Body lines (raw blockquote lines, without the leading `>` prefix stripped) */
  bodyLines: string[];
  /** Line index in the original source where the header appears */
  startLine: number;
}

function resolveAsideType(rawType: string): { asideType: AsideType; isUnknown: boolean } {
  const key = rawType.toLowerCase().trim();
  const asideType = CALLOUT_TYPE_MAP[key];
  if (asideType) return { asideType, isUnknown: false };
  return { asideType: 'note', isUnknown: true };
}

/**
 * Strip one level of blockquote prefix from a line.
 * `>  text` → ` text` (preserves one trailing space after `>`)
 */
function stripOneLevel(line: string): string {
  return line.replace(/^>\s?/, '');
}

/**
 * Normalise Obsidian callouts in Markdown/MDX content to Starlight aside directives.
 *
 * Foldable callouts (+ / -) are rendered with HTML <details>/<summary> as an accessible fallback
 * because Starlight asides do not have a native collapse mechanism.
 *
 * Nested callouts are handled by recursive processing of the body content.
 */
function normalizeCallouts(
  content: string,
  filePath: string,
  strict: boolean,
): { content: string; diagnostics: FeaDocsDiagnostic[] } {
  const diagnostics: FeaDocsDiagnostic[] = [];
  const lines = content.split('\n');
  const output: string[] = [];
  let i = 0;
  let inFencedCodeBlock = false;

  while (i < lines.length) {
    const line = lines[i];

    // Track fenced code block state (``` or ~~~)
    if (/^[ \t]*(```|~~~)/.test(line)) {
      inFencedCodeBlock = !inFencedCodeBlock;
      output.push(line);
      i++;
      continue;
    }
    if (inFencedCodeBlock) {
      output.push(line);
      i++;
      continue;
    }

    const match = CALLOUT_HEADER_RE.exec(line);

    if (match) {
      const depth = match[1].length; // number of '>' chars
      const rawType = match[2].trim();
      const foldable = match[3]; // '+', '-', or ''
      const customTitle = match[4].trim();

      // Collect body lines: all consecutive lines starting with at least `depth` `>` chars
      const bodyLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const bodyLine = lines[j];
        // A continuation line must start with `>` (possibly with depth-many `>`)
        // An empty blockquote line `>` or `> ` also counts
        if (/^>/.test(bodyLine)) {
          bodyLines.push(bodyLine);
          j++;
        } else if (bodyLine.trim() === '') {
          // Blank line can separate a callout body paragraph — include it and continue
          // but stop if the next non-blank line is not a blockquote
          const peek = lines[j + 1];
          if (peek !== undefined && /^>/.test(peek)) {
            bodyLines.push(bodyLine);
            j++;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      i = j; // advance past the callout block

      // Strip depth-many `>` from body lines to get the inner content
      const innerLines = bodyLines.map((bl) => {
        let stripped = bl;
        for (let d = 0; d < depth; d++) {
          stripped = stripOneLevel(stripped);
        }
        return stripped;
      });
      const innerContent = innerLines.join('\n');

      // Recursively normalise nested callouts in the body
      const nested = normalizeCallouts(innerContent, filePath, strict);
      diagnostics.push(...nested.diagnostics);
      const processedBody = nested.content;

      // Resolve aside type
      const { asideType, isUnknown } = resolveAsideType(rawType);
      if (isUnknown) {
        diagnostics.push({
          code: 'UNKNOWN_CALLOUT_TYPE',
          severity: 'warning',
          message: `Unknown callout type "[!${rawType}]" — rendered as default note aside.`,
          sourcePath: filePath,
          suggestion: `Use a supported callout type: note, info, tip, warning, danger, question, etc.`,
        } as FeaDocsDiagnostic);
      }

      // Determine title
      const defaultTitle = rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase();
      const title = customTitle || defaultTitle;

      if (foldable) {
        // Foldable callout: use HTML <details>/<summary> as accessible fallback
        // This works in Starlight's MDX and in GitHub Markdown.
        const openAttr = foldable === '+' ? ' open' : '';
        output.push(`<details${openAttr}>`);
        output.push(`<summary>${title}</summary>`);
        output.push('');
        output.push(processedBody);
        output.push('');
        output.push(`</details>`);
      } else {
        // Standard aside directive
        output.push(`:::${asideType}[${title}]`);
        output.push(processedBody);
        output.push(`:::`);
      }
    } else {
      output.push(line);
      i++;
    }
  }

  return { content: output.join('\n'), diagnostics };
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

function createCalloutHandler(): SyntaxHandler {
  return {
    name: '@fea-docs/obsidian:callouts',
    transform(document: SyntaxDocument): SyntaxTransformResult {
      // Skip transformation inside fenced code blocks — only transform prose
      // The normalizeCallouts function operates on the full document content but
      // CALLOUT_HEADER_RE only matches lines starting with `>`, so fenced code
      // blocks are naturally safe. However, to be extra defensive we skip
      // content that clearly lives in a code fence.
      const { content, diagnostics } = normalizeCallouts(
        document.content,
        document.path,
        false, // strict is threaded in by the normalizer when needed
      );

      // If foldable callouts were emitted we may need MDX/HTML — Starlight
      // supports raw HTML in `.md` files so we keep the format as-is.
      return {
        content,
        format: document.format,
        diagnostics,
      };
    },
  };
}

export function createObsidianHandlers(options: ObsidianHandlersOptions = {}): SyntaxHandler[] {
  const handlers: SyntaxHandler[] = [];

  const enableCallouts = options.callouts !== false; // default on

  if (enableCallouts) {
    handlers.push(createCalloutHandler());
  }

  return handlers;
}
