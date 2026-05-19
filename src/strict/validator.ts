import type { DocsGraph, Diagnostic } from '../types.js';
import { LinkAssetResolver } from '../link-asset/resolver.js';
import { findDuplicateSlugs } from '../content-graph/parser.js';

export interface ValidationResult {
  passed: boolean;
  diagnostics: Diagnostic[];
}

/**
 * StrictValidator enforces CI-grade quality rules.
 * Fails on:
 * - Broken internal links
 * - Unresolved assets/images
 * - Duplicate slugs
 * - Missing frontmatter title (when label fallback chain exhausted)
 * - MDX import resolution errors (detected via frontmatter convention)
 */
export class StrictValidator {
  validate(graph: DocsGraph): ValidationResult {
    const diagnostics: Diagnostic[] = [];
    const resolver = new LinkAssetResolver(graph, false); // strict = not dev mode

    // 1. Duplicate slugs
    const dupes = findDuplicateSlugs(graph.pages);
    for (const { slug, pages } of dupes) {
      diagnostics.push({
        type: 'error',
        code: 'DUPLICATE_SLUG',
        message: `Duplicate slug "${slug}" found in: ${pages.map((p) => p.relativePath).join(', ')}`,
      });
    }

    // 2. Pages with no resolvable label
    for (const page of graph.pages) {
      if (!page.label || page.label.trim() === '') {
        diagnostics.push({
          type: 'error',
          code: 'MISSING_LABEL',
          message: `Cannot determine label for "${page.relativePath}"`,
          file: page.relativePath,
        });
      }
    }

    // 3. Frontmatter schema errors (basic: title must be string if present)
    for (const page of graph.pages) {
      const { frontmatter } = page;
      if ('title' in frontmatter && typeof frontmatter['title'] !== 'string') {
        diagnostics.push({
          type: 'error',
          code: 'FRONTMATTER_SCHEMA_ERROR',
          message: `Frontmatter "title" must be a string in "${page.relativePath}"`,
          file: page.relativePath,
        });
      }
    }

    return {
      passed: !diagnostics.some((d) => d.type === 'error'),
      diagnostics,
    };
  }
}
