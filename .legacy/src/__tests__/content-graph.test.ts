import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ContentGraphEngine } from '../content-graph/engine.js';
import { injectFrontmatterTitle } from '../content-graph/parser.js';

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

  it('excludes dot-prefixed directories by default', async () => {
    writeFile(tmpDir, 'index.md', '# Index');
    writeFile(tmpDir, '.abc/license.md', '# License');

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

  it('derives entryId from relative path', async () => {
    writeFile(tmpDir, 'My Page.md', '# My Page');

    const engine = new ContentGraphEngine({ root: tmpDir, ignore: [] });
    const graph = await engine.scan();

    expect(graph.pages[0].entryId).toBe('my page');
  });

  it('normalizes nested index.md to parent entryId', async () => {
    writeFile(tmpDir, 'example/docs/index.md', '# Example docs index');

    const engine = new ContentGraphEngine({ root: tmpDir, ignore: [] });
    const graph = await engine.scan();

    expect(graph.pages).toHaveLength(1);
    expect(graph.pages[0].entryId).toBe('example/docs');
  });

  it('normalizes nested index.mdx to parent entryId', async () => {
    writeFile(tmpDir, 'example/docs/index.mdx', '# Example docs index');

    const engine = new ContentGraphEngine({ root: tmpDir, ignore: [] });
    const graph = await engine.scan();

    expect(graph.pages).toHaveLength(1);
    expect(graph.pages[0].entryId).toBe('example/docs');
  });

  it('normalizes top-level index.md to empty entryId', async () => {
    writeFile(tmpDir, 'index.md', '# Home');

    const engine = new ContentGraphEngine({ root: tmpDir, ignore: [] });
    const graph = await engine.scan();

    expect(graph.pages).toHaveLength(1);
    expect(graph.pages[0].entryId).toBe('');
  });
});

describe('injectFrontmatterTitle', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-inject-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prepends a new frontmatter block when none exists', () => {
    const filePath = path.join(tmpDir, 'no-fm.md');
    fs.writeFileSync(filePath, '# Hello\n\nContent.');
    injectFrontmatterTitle(filePath, '# Hello\n\nContent.', 'Hello');
    const result = fs.readFileSync(filePath, 'utf-8');
    expect(result).toMatch(/^---\ntitle: 'Hello'\n---/);
    expect(result).toContain('# Hello');
  });

  it('inserts title into existing frontmatter block', () => {
    const raw = `---\ndescription: foo\n---\n\n# Hello\n`;
    const filePath = path.join(tmpDir, 'has-fm.md');
    fs.writeFileSync(filePath, raw);
    injectFrontmatterTitle(filePath, raw, 'Hello');
    const result = fs.readFileSync(filePath, 'utf-8');
    expect(result).toMatch(/^---\ntitle: 'Hello'\ndescription: foo/);
  });

  it('does not modify a file that already has a title', () => {
    const raw = `---\ntitle: Existing\n---\n\n# Hello\n`;
    const filePath = path.join(tmpDir, 'with-title.md');
    fs.writeFileSync(filePath, raw);
    const mtimeBefore = fs.statSync(filePath).mtimeMs;
    injectFrontmatterTitle(filePath, raw, 'Hello');
    const mtimeAfter = fs.statSync(filePath).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  it('escapes single quotes in the label', () => {
    const filePath = path.join(tmpDir, 'apos.md');
    fs.writeFileSync(filePath, 'Content.');
    injectFrontmatterTitle(filePath, 'Content.', "Alice's Guide");
    const result = fs.readFileSync(filePath, 'utf-8');
    expect(result).toContain("title: 'Alice''s Guide'");
  });
});
