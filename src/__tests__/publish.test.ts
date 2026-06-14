import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { filterDocsByTarget } from '../publish/filter.js';
import { collectSources } from '../publish/source-copier.js';
import type { DocsGraph, DocPage } from '../types.js';

function makePage(overrides: Partial<DocPage> & { relativePath: string }): DocPage {
  return {
    absolutePath: `/fake/${overrides.relativePath}`,
    entryId: overrides.relativePath.replace(/\.(md|mdx)$/, '').toLowerCase(),
    label: overrides.relativePath,
    frontmatter: {},
    isSectionIndex: false,
    ext: 'md',
    ...overrides,
  };
}

describe('filterDocsByTarget', () => {
  const graph: DocsGraph = {
    root: '/fake',
    pages: [
      makePage({ relativePath: 'public.md', frontmatter: { publishTo: 'web' } }),
      makePage({ relativePath: 'internal.md', frontmatter: { publishTo: 'pdf' } }),
      makePage({ relativePath: 'both.md', frontmatter: { publishTo: ['web', 'pdf'] } }),
      makePage({ relativePath: 'no-publish.md', frontmatter: {} }),
      makePage({ relativePath: 'unrelated.md', frontmatter: { publishTo: 'client-x' } }),
    ],
  };

  it('includes docs with matching publishTo string', () => {
    const result = filterDocsByTarget(graph, 'web');
    expect(result.map((p) => p.relativePath)).toEqual(['public.md', 'both.md']);
  });

  it('includes docs with publishTo array containing target', () => {
    const result = filterDocsByTarget(graph, 'pdf');
    expect(result.map((p) => p.relativePath)).toEqual(['internal.md', 'both.md']);
  });

  it('excludes docs without publishTo', () => {
    const result = filterDocsByTarget(graph, 'web');
    expect(result.find((p) => p.relativePath === 'no-publish.md')).toBeUndefined();
  });

  it('excludes docs with non-matching publishTo', () => {
    const result = filterDocsByTarget(graph, 'web');
    expect(result.find((p) => p.relativePath === 'internal.md')).toBeUndefined();
  });

  it('returns empty array when no docs match', () => {
    const result = filterDocsByTarget(graph, 'nonexistent');
    expect(result).toEqual([]);
  });

  it('handles empty graph', () => {
    const empty: DocsGraph = { root: '/fake', pages: [] };
    expect(filterDocsByTarget(empty, 'web')).toEqual([]);
  });
});

describe('collectSources', () => {
  let tmpDir: string;
  let srcDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-test-'));
    srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // doc1.md with local image and PDF reference
    fs.mkdirSync(path.join(srcDir, 'images'), { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'doc1.md'),
      '# Doc 1\n\n![Diagram](images/diag.png)\n\n[Download](file.pdf)\n',
    );
    fs.writeFileSync(path.join(srcDir, 'images', 'diag.png'), 'fake-png');
    fs.writeFileSync(path.join(srcDir, 'file.pdf'), 'fake-pdf');

    // doc2.md in nested dir with parent-relative image reference
    fs.mkdirSync(path.join(srcDir, 'nested'), { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'nested', 'doc2.md'),
      '# Doc 2\n\n![Photo](../images/photo.png)\n',
    );
    fs.writeFileSync(path.join(srcDir, 'images', 'photo.png'), 'fake-photo');

    // Unreferenced file
    fs.writeFileSync(path.join(srcDir, 'unreferenced.md'), '# Not referenced');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copies matched doc files and their referenced local assets', () => {
    const outDir = path.join(tmpDir, 'out1');
    collectSources({
      matchedPages: [
        { absolutePath: path.join(srcDir, 'doc1.md'), relativePath: 'doc1.md' },
      ],
      root: srcDir,
      outputDir: outDir,
    });

    expect(fs.existsSync(path.join(outDir, 'doc1.md'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'images', 'diag.png'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'file.pdf'))).toBe(true);
  });

  it('does not copy unreferenced files', () => {
    const outDir = path.join(tmpDir, 'out2');
    collectSources({
      matchedPages: [
        { absolutePath: path.join(srcDir, 'doc1.md'), relativePath: 'doc1.md' },
      ],
      root: srcDir,
      outputDir: outDir,
    });

    expect(fs.existsSync(path.join(outDir, 'unreferenced.md'))).toBe(false);
  });

  it('resolves parent-relative asset references', () => {
    const outDir = path.join(tmpDir, 'out3');
    collectSources({
      matchedPages: [
        { absolutePath: path.join(srcDir, 'nested', 'doc2.md'), relativePath: 'nested/doc2.md' },
      ],
      root: srcDir,
      outputDir: outDir,
    });

    expect(fs.existsSync(path.join(outDir, 'nested', 'doc2.md'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'images', 'photo.png'))).toBe(true);
  });

  it('does not copy external URLs', () => {
    const extDoc = path.join(srcDir, 'external.md');
    fs.writeFileSync(extDoc, '# Ext\n\n![External](https://example.com/img.png)\n');
    const outDir = path.join(tmpDir, 'out4');

    collectSources({
      matchedPages: [
        { absolutePath: extDoc, relativePath: 'external.md' },
      ],
      root: srcDir,
      outputDir: outDir,
    });

    expect(fs.existsSync(path.join(outDir, 'external.md'))).toBe(true);
  });

  it('copies doc files without any references', () => {
    const plainDoc = path.join(srcDir, 'plain.md');
    fs.writeFileSync(plainDoc, '# Plain doc');
    const outDir = path.join(tmpDir, 'out5');

    collectSources({
      matchedPages: [
        { absolutePath: plainDoc, relativePath: 'plain.md' },
      ],
      root: srcDir,
      outputDir: outDir,
    });

    expect(fs.existsSync(path.join(outDir, 'plain.md'))).toBe(true);
  });
});
