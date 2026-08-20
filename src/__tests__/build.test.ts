import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runBuild } from '../cli/commands/build.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-build-'));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

describe('fea-docs build', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function buildRoot(outDir = 'dist', strict = false) {
    return runBuild({ root: tmpDir, outDir, strict });
  }

  function readOutput(relPath: string): string {
    return fs.readFileSync(path.join(tmpDir, 'dist', relPath), 'utf-8');
  }

  it('builds an empty tree with an empty nav and a message page, exit path 0', async () => {
    const result = await buildRoot();

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('no renderable pages');
    expect(result.emitted).toEqual(['index.html']);
    expect(result.pages).toHaveLength(0);

    const html = readOutput('index.html');
    expect(html).toContain('<ul></ul>');
    expect(html).toContain('No documentation pages were found');
  });

  it('finds pages in a populated tree and emits a stable index', async () => {
    writeFile(tmpDir, 'index.md', '# Home');
    writeFile(tmpDir, 'guide/setup.md', '# Setup');

    const result = await buildRoot();

    expect(result.warnings).toHaveLength(0);
    expect(result.pages.map((page) => page.relativePath)).toEqual([
      'guide/setup.md',
      'index.md',
    ]);
    expect(result.emitted).toEqual(['index.html']);

    const html = readOutput('index.html');
    expect(html).toContain('guide/setup.md');
    expect(html).toContain('2 documentation page(s)');
  });

  it('never scans its own output when pages sit inside the output tree', async () => {
    writeFile(tmpDir, 'index.md', '# Docs');
    writeFile(tmpDir, 'dist/ghost.md', '# Ghost');

    const result = await buildRoot();

    expect(result.pages.map((page) => page.relativePath)).toEqual(['index.md']);
  });

  it('is deterministic: repeated builds produce identical output', async () => {
    writeFile(tmpDir, 'b.md', '# B');
    writeFile(tmpDir, 'a/c.md', '# C');

    const first = await buildRoot();
    const firstIndex = fs.readFileSync(path.join(tmpDir, 'dist', 'index.html'), 'utf-8');

    const second = await buildRoot();
    const secondIndex = fs.readFileSync(path.join(tmpDir, 'dist', 'index.html'), 'utf-8');

    expect(second.emitted).toEqual(first.emitted);
    expect(second.pages.map((page) => page.relativePath)).toEqual(
      first.pages.map((page) => page.relativePath),
    );
    expect(secondIndex).toBe(firstIndex);
  });

  it('removes prior output files before writing', async () => {
    writeFile(tmpDir, 'index.md', '# Home');
    const outDir = path.join(tmpDir, 'dist');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'stale.html'), 'old');

    const result = await buildRoot();

    expect(result.emitted).toEqual(['index.html']);
    expect(fs.existsSync(path.join(outDir, 'stale.html'))).toBe(false);
  });

  it('refuses an output directory that would erase the root', async () => {
    await expect(buildRoot('.', false)).rejects.toThrow(/would erase/);
  });

  it('is non-interactive: performs no prompts and returns a result', async () => {
    writeFile(tmpDir, 'index.md', '# Home');
    const result = await buildRoot();
    expect(result.emitted).toContain('index.html');
  });
});