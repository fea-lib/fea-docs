import { describe, it, expect } from 'vitest';
import { StrictValidator } from '../strict/validator.js';
import type { DocsGraph, DocPage } from '../types.js';

function makePage(overrides: Partial<DocPage> & { rel: string }): DocPage {
  return {
    absolutePath: `/tmp/${overrides.rel}`,
    relativePath: overrides.rel,
    slug: overrides.slug ?? overrides.rel.replace(/\.md$/, ''),
    label: overrides.label ?? 'Page',
    frontmatter: overrides.frontmatter ?? {},
    isSectionIndex: overrides.isSectionIndex ?? false,
    ext: 'md',
  };
}

describe('StrictValidator', () => {
  it('passes a clean graph', () => {
    const graph: DocsGraph = {
      root: '/tmp',
      pages: [
        makePage({ rel: 'a.md', label: 'A', slug: 'a' }),
        makePage({ rel: 'b.md', label: 'B', slug: 'b' }),
      ],
    };
    const validator = new StrictValidator();
    const result = validator.validate(graph);
    expect(result.passed).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('detects duplicate slugs', () => {
    const graph: DocsGraph = {
      root: '/tmp',
      pages: [
        makePage({ rel: 'a.md', slug: 'same', label: 'A' }),
        makePage({ rel: 'b.md', slug: 'same', label: 'B' }),
      ],
    };
    const validator = new StrictValidator();
    const result = validator.validate(graph);
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'DUPLICATE_SLUG')).toBe(true);
  });

  it('detects pages with no label', () => {
    const graph: DocsGraph = {
      root: '/tmp',
      pages: [makePage({ rel: 'a.md', label: '' })],
    };
    const validator = new StrictValidator();
    const result = validator.validate(graph);
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'MISSING_LABEL')).toBe(true);
  });

  it('detects frontmatter title schema errors', () => {
    const graph: DocsGraph = {
      root: '/tmp',
      pages: [makePage({ rel: 'a.md', label: 'A', frontmatter: { title: 123 } })],
    };
    const validator = new StrictValidator();
    const result = validator.validate(graph);
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'FRONTMATTER_SCHEMA_ERROR')).toBe(true);
  });
});
