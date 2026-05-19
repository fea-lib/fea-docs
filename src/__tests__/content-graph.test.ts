import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ContentGraphEngine } from '../content-graph/engine.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-test-'));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

describe('ContentGraphEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers all .md files under root', async () => {
    writeFile(tmpDir, 'README.md', '# Home');
    writeFile(tmpDir, 'guide/intro.md', '# Intro');
    writeFile(tmpDir, 'guide/advanced.md', '# Advanced');

    const engine = new ContentGraphEngine({ root: tmpDir, ignore: [], slugOverrides: {} });
    const graph = await engine.scan();

    expect(graph.pages).toHaveLength(3);
    expect(graph.root).toBe(tmpDir);
  });

  it('excludes node_modules by default', async () => {
    writeFile(tmpDir, 'index.md', '# Index');
    writeFile(tmpDir, 'node_modules/pkg/README.md', '# Pkg');

    const engine = new ContentGraphEngine({ root: tmpDir, ignore: [], slugOverrides: {} });
    const graph = await engine.scan();

    expect(graph.pages).toHaveLength(1);
    expect(graph.pages[0].relativePath).toBe('index.md');
  });

  it('respects .gitignore exclusions', async () => {
    writeFile(tmpDir, 'index.md', '# Index');
    writeFile(tmpDir, 'private/secret.md', '# Secret');
    writeFile(tmpDir, '.gitignore', 'private/');

    const engine = new ContentGraphEngine({ root: tmpDir, ignore: [], slugOverrides: {} });
    const graph = await engine.scan();

    expect(graph.pages).toHaveLength(1);
    expect(graph.pages[0].relativePath).toBe('index.md');
  });

  it('respects user-defined ignore globs', async () => {
    writeFile(tmpDir, 'index.md', '# Index');
    writeFile(tmpDir, 'drafts/wip.md', '# WIP');

    const engine = new ContentGraphEngine({
      root: tmpDir,
      ignore: ['**/drafts/**'],
      slugOverrides: {},
    });
    const graph = await engine.scan();

    expect(graph.pages).toHaveLength(1);
  });

  it('resolves labels via frontmatter title -> H1 -> filename', async () => {
    writeFile(tmpDir, 'a.md', '---\ntitle: Custom Title\n---\n# H1');
    writeFile(tmpDir, 'b.md', '# Only H1');
    writeFile(tmpDir, 'c.md', 'Just content');

    const engine = new ContentGraphEngine({ root: tmpDir, ignore: [], slugOverrides: {} });
    const graph = await engine.scan();

    const a = graph.pages.find((p) => p.relativePath === 'a.md')!;
    const b = graph.pages.find((p) => p.relativePath === 'b.md')!;
    const c = graph.pages.find((p) => p.relativePath === 'c.md')!;

    expect(a.label).toBe('Custom Title');
    expect(b.label).toBe('Only H1');
    expect(c.label).toBe('c');
  });

  it('marks README as section index', async () => {
    writeFile(tmpDir, 'guide/README.md', '# Guide');
    writeFile(tmpDir, 'guide/setup.md', '# Setup');

    const engine = new ContentGraphEngine({ root: tmpDir, ignore: [], slugOverrides: {} });
    const graph = await engine.scan();

    const readme = graph.pages.find((p) => p.relativePath === 'guide/README.md')!;
    const setup = graph.pages.find((p) => p.relativePath === 'guide/setup.md')!;

    expect(readme.isSectionIndex).toBe(true);
    expect(setup.isSectionIndex).toBe(false);
  });

  it('discovers .mdx files', async () => {
    writeFile(tmpDir, 'index.md', '# Index');
    writeFile(tmpDir, 'interactive.mdx', '# Interactive');

    const engine = new ContentGraphEngine({ root: tmpDir, ignore: [], slugOverrides: {} });
    const graph = await engine.scan();

    expect(graph.pages).toHaveLength(2);
    const mdx = graph.pages.find((p) => p.ext === 'mdx')!;
    expect(mdx.relativePath).toBe('interactive.mdx');
  });

  it('applies slug overrides', async () => {
    writeFile(tmpDir, 'my-page.md', '# My Page');

    const engine = new ContentGraphEngine({
      root: tmpDir,
      ignore: [],
      slugOverrides: { 'my-page.md': 'custom-slug' },
    });
    const graph = await engine.scan();

    expect(graph.pages[0].slug).toBe('custom-slug');
  });
});
