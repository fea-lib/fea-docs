import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ContentGraphEngine } from '../content-graph/engine.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-graph-'));
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

  async function scanPages(outDir = 'dist'): Promise<Awaited<ReturnType<ContentGraphEngine['scan']>>> {
    const engine = new ContentGraphEngine({ root: tmpDir, outDir });
    return engine.scan();
  }

  it('discovers all .md files under the root recursively', async () => {
    writeFile(tmpDir, 'README.md', '# Home');
    writeFile(tmpDir, 'guide/intro.md', '# Intro');
    writeFile(tmpDir, 'guide/deep/advanced.md', '# Advanced');

    const graph = await scanPages();

    expect(graph.pages.map((page) => page.relativePath)).toEqual([
      'README.md',
      'guide/deep/advanced.md',
      'guide/intro.md',
    ]);
  });

  it('discovers .mdx files alongside .md files', async () => {
    writeFile(tmpDir, 'index.md', '# Index');
    writeFile(tmpDir, 'interactive.mdx', '# Interactive');

    const graph = await scanPages();

    expect(graph.pages.map((page) => page.relativePath)).toEqual([
      'index.md',
      'interactive.mdx',
    ]);
    const mdx = graph.pages.find((page) => page.ext === 'mdx')!;
    expect(mdx).toBeDefined();
    expect(mdx.route).toBe('interactive');
  });

  it('derives routes without the markdown extension', async () => {
    writeFile(tmpDir, 'sub/foo.md', '# Foo');

    const graph = await scanPages();

    expect(graph.pages[0].route).toBe('sub/foo');
  });

  it('never scans node_modules at any depth', async () => {
    writeFile(tmpDir, 'index.md', '# Index');
    writeFile(tmpDir, 'node_modules/pkg/README.md', '# Pkg');
    writeFile(tmpDir, 'sub/node_modules/pkg/README.md', '# Pkg2');

    const graph = await scanPages();

    expect(graph.pages.map((page) => page.relativePath)).toEqual(['index.md']);
  });

  it('never scans .git', async () => {
    writeFile(tmpDir, 'index.md', '# Index');
    writeFile(tmpDir, '.git/hooks/sample.md', '# Nope');

    const graph = await scanPages();

    expect(graph.pages.map((page) => page.relativePath)).toEqual(['index.md']);
  });

  it('never scans the tool output directory', async () => {
    writeFile(tmpDir, 'index.md', '# Index');
    writeFile(tmpDir, 'dist/was-scanning.md', '# Dist page');

    const graph = await scanPages('dist');

    expect(graph.pages.map((page) => page.relativePath)).toEqual(['index.md']);
  });

  it('never scans a configured output directory', async () => {
    writeFile(tmpDir, 'index.md', '# Index');
    writeFile(tmpDir, 'web/site.md', '# Site');
    writeFile(tmpDir, 'web/out/emit-me.md', '# Emitted');

    const graph = await scanPages('web/out');

    expect(graph.pages.map((page) => page.relativePath)).toEqual([
      'index.md',
      'web/site.md',
    ]);
  });

  it('honors .gitignore at the root', async () => {
    writeFile(tmpDir, 'index.md', '# Index');
    writeFile(tmpDir, 'private/secret.md', '# Secret');
    writeFile(tmpDir, '.gitignore', 'private/\nnotes.md');

    const graph = await scanPages();

    expect(graph.pages.map((page) => page.relativePath)).toEqual(['index.md']);
  });

  it('honors .gitignore in a subdirectory relative to that directory', async () => {
    writeFile(tmpDir, 'index.md', '# Index');
    writeFile(tmpDir, 'manual/draft/wip.md', '# WIP');
    writeFile(tmpDir, 'manual/released/final.md', '# Final');
    writeFile(tmpDir, 'manual/.gitignore', 'draft/');

    const graph = await scanPages();

    expect(graph.pages.map((page) => page.relativePath)).toEqual([
      'index.md',
      'manual/released/final.md',
    ]);
  });

  it('a deeper !pattern re-includes a file ignored by the same .gitignore', async () => {
    writeFile(tmpDir, 'drafts/wip.md', '# WIP');
    writeFile(tmpDir, 'drafts/keep.md', '# Keep');
    writeFile(tmpDir, '.gitignore', 'drafts/*\n!drafts/keep.md\n');

    const graph = await scanPages();

    expect(graph.pages.map((page) => page.relativePath)).toEqual(['drafts/keep.md']);
  });

  it('skips symbolic links', async () => {
    writeFile(tmpDir, 'index.md', '# Index');
    writeFile(tmpDir, 'real/notes.md', '# Notes');
    fs.symlinkSync(path.join(tmpDir, 'real'), path.join(tmpDir, 'linked-dir'), 'dir');
    fs.symlinkSync(path.join(tmpDir, 'index.md'), path.join(tmpDir, 'alias.md'), 'file');

    const graph = await scanPages();

    expect(graph.pages.map((page) => page.relativePath)).toEqual([
      'index.md',
      'real/notes.md',
    ]);
  });

  it('orders pages deterministically', async () => {
    writeFile(tmpDir, 'zeta.md', '# Z');
    writeFile(tmpDir, 'alpha.md', '# A');
    writeFile(tmpDir, 'middle.md', '# M');

    const first = await scanPages();
    const second = await scanPages();

    expect(first.pages.map((page) => page.relativePath)).toEqual([
      'alpha.md',
      'middle.md',
      'zeta.md',
    ]);
    expect(second.pages.map((page) => page.relativePath)).toEqual(
      first.pages.map((page) => page.relativePath),
    );
  });
});