import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LinkAssetResolver } from '../link-asset/resolver.js';
import type { DocsGraph } from '../types.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-link-test-'));
}

describe('LinkAssetResolver', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeGraph(pages: Array<{ rel: string }>): DocsGraph {
    return {
      root: tmpDir,
      pages: pages.map((p) => ({
        absolutePath: path.join(tmpDir, p.rel),
        relativePath: p.rel,
        entryId: p.rel.replace(/\.(md|mdx)$/, '').toLowerCase(),
        label: p.rel,
        frontmatter: {},
        isSectionIndex: false,
        ext: 'md' as const,
      })),
    };
  }

  it('passes through external links', () => {
    const graph = makeGraph([{ rel: 'index.md' }]);
    const resolver = new LinkAssetResolver(graph, true);
    const result = resolver.resolveLink('https://example.com', 'index.md');
    expect(result.resolved).toBe(true);
    expect(result.href).toBe('https://example.com');
  });

  it('passes through anchor links', () => {
    const graph = makeGraph([{ rel: 'index.md' }]);
    const resolver = new LinkAssetResolver(graph, true);
    const result = resolver.resolveLink('#heading', 'index.md');
    expect(result.resolved).toBe(true);
    expect(result.href).toBe('#heading');
  });

  it('resolves internal doc links', () => {
    const graph = makeGraph([
      { rel: 'index.md' },
      { rel: 'guide/intro.md' },
    ]);
    const resolver = new LinkAssetResolver(graph, true);
    const result = resolver.resolveLink('guide/intro.md', 'index.md');
    expect(result.resolved).toBe(true);
    expect(result.href).toBe('/guide/intro/');
  });

  it('emits warning for broken internal link in dev mode', () => {
    const graph = makeGraph([{ rel: 'index.md' }]);
    const resolver = new LinkAssetResolver(graph, true);
    const result = resolver.resolveLink('missing.md', 'index.md');
    expect(result.resolved).toBe(false);
    expect(result.diagnostic?.type).toBe('warning');
    expect(result.diagnostic?.code).toBe('BROKEN_INTERNAL_LINK');
  });

  it('emits error for broken internal link in strict mode', () => {
    const graph = makeGraph([{ rel: 'index.md' }]);
    const resolver = new LinkAssetResolver(graph, false);
    const result = resolver.resolveLink('missing.md', 'index.md');
    expect(result.resolved).toBe(false);
    expect(result.diagnostic?.type).toBe('error');
  });

  it('resolves existing asset file', () => {
    fs.writeFileSync(path.join(tmpDir, 'logo.png'), 'fake-image');
    const graph = makeGraph([{ rel: 'index.md' }]);
    const resolver = new LinkAssetResolver(graph, true);
    const result = resolver.resolveLink('logo.png', 'index.md');
    expect(result.resolved).toBe(true);
    expect(result.href).toBe('/logo.png');
  });

  it('resolves nested asset links to natural absolute paths', () => {
    fs.mkdirSync(path.join(tmpDir, 'docs', 'guide'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'docs', 'guide', 'sheet.pdf'), 'fake-pdf');

    const graph = makeGraph([{ rel: 'docs/guide/intro.md' }]);
    const resolver = new LinkAssetResolver(graph, true);
    const result = resolver.resolveLink('sheet.pdf', 'docs/guide/intro.md');

    expect(result.resolved).toBe(true);
    expect(result.href).toBe('/docs/guide/sheet.pdf');
  });

  it('emits warning for missing asset in dev mode', () => {
    const graph = makeGraph([{ rel: 'index.md' }]);
    const resolver = new LinkAssetResolver(graph, true);
    const result = resolver.resolveLink('missing.png', 'index.md');
    expect(result.resolved).toBe(false);
    expect(result.diagnostic?.code).toBe('UNRESOLVED_ASSET');
  });
});
