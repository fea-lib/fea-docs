import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CONTENT_GLOB_PATTERNS, RuntimeAdapter } from '../runtime/adapter.js';
import type { DocsGraph, ResolvedConfig } from '../types.js';
import { feaDocsWorkspaceCacheDir } from '../utils/cache-dir.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-runtime-test-'));
}

function makeConfig(root: string): ResolvedConfig {
  return {
    name: undefined,
    title: undefined,
    root,
    ignore: [],
    port: 4321,
    open: false,
    strict: false,
    frameworks: [],
    aliases: {},
    tailscaleServe: false,
    caffeinate: false,
    expose: false,
  };
}

function makeGraph(root: string, pages: Array<{ rel: string; label: string; entryId: string; isSectionIndex?: boolean }>): DocsGraph {
  return {
    root,
    pages: pages.map((p) => ({
      absolutePath: path.join(root, p.rel),
      relativePath: p.rel,
      entryId: p.entryId,
      label: p.label,
      frontmatter: { title: p.label },
      isSectionIndex: p.isSectionIndex ?? false,
      ext: 'md' as const,
    })),
  };
}

async function invokePrivate(
  adapter: RuntimeAdapter,
  method: 'writeContentConfig' | 'writeContentLinks' | 'writeAstroConfig' | 'writeRemarkPlugin',
): Promise<void> {
  await (adapter as unknown as Record<string, () => Promise<void>>)[method]();
}

describe('RuntimeAdapter content loader config', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('includes dot-prefixed files and directories in content glob patterns', async () => {
    const graph = makeGraph(tmpDir, [
      { rel: '.secrets/README.md', label: 'Secrets', entryId: '.secrets/readme', isSectionIndex: true },
    ]);

    const adapter = new RuntimeAdapter({
      config: makeConfig(tmpDir),
      graph,
    });

    fs.mkdirSync(path.join(adapter.projectDir, 'src'), { recursive: true });
    await invokePrivate(adapter, 'writeContentConfig');

    const contentConfigPath = path.join(adapter.projectDir, 'src', 'content.config.ts');
    const contentConfig = fs.readFileSync(contentConfigPath, 'utf-8');

    expect(CONTENT_GLOB_PATTERNS).toEqual([
      '**/*.{md,mdx}',
      '**/.*/**/*.{md,mdx}',
      '**/.*.{md,mdx}',
      '!**/node_modules/**',
    ]);
    expect(contentConfig).toContain(`pattern: ${JSON.stringify(CONTENT_GLOB_PATTERNS, null, 6).replace(/\n/g, '\n      ')}`);
  });

  it('uses a stable user-cache runtime project path for the same root', () => {
    const graph = makeGraph(tmpDir, [
      { rel: 'guide/intro.md', label: 'Intro', entryId: 'guide/intro' },
    ]);

    const adapterA = new RuntimeAdapter({ config: makeConfig(tmpDir), graph });
    const adapterB = new RuntimeAdapter({ config: makeConfig(tmpDir), graph });

    expect(adapterA.projectDir).toBe(adapterB.projectDir);
    expect(adapterA.projectDir).toBe(path.join(feaDocsWorkspaceCacheDir(tmpDir), 'app'));
    expect(adapterA.projectDir).not.toContain(path.join(tmpDir, '.fea-docs'));
  });

  it('symlinks src/content/docs to the full source root directory', async () => {
    const graph = makeGraph(tmpDir, [
      { rel: 'guide/intro.md', label: 'Intro', entryId: 'guide/intro' },
    ]);

    const adapter = new RuntimeAdapter({
      config: makeConfig(tmpDir),
      graph,
    });

    fs.mkdirSync(path.join(adapter.projectDir, 'src', 'content'), { recursive: true });
    await invokePrivate(adapter, 'writeContentLinks');

    const contentDir = path.join(adapter.projectDir, 'src', 'content', 'docs');
    const symlinkTarget = fs.readlinkSync(contentDir);

    expect(fs.lstatSync(contentDir).isSymbolicLink()).toBe(true);
    expect(path.resolve(path.dirname(contentDir), symlinkTarget)).toBe(path.resolve(tmpDir));
  });

  it('writes Astro config with Starlight autogenerate sidebar', async () => {
    const graph = makeGraph(tmpDir, [
      { rel: 'guide/intro.md', label: 'Intro', entryId: 'guide/intro' },
    ]);

    const adapter = new RuntimeAdapter({
      config: makeConfig(tmpDir),
      graph,
    });

    fs.mkdirSync(adapter.projectDir, { recursive: true });
    await invokePrivate(adapter, 'writeAstroConfig');

    const astroConfig = fs.readFileSync(path.join(adapter.projectDir, 'astro.config.mjs'), 'utf-8');

    expect(astroConfig).toContain(`publicDir: ${JSON.stringify(tmpDir)}`);
    expect(astroConfig).toContain("sidebar: [");
    expect(astroConfig).toContain("{ autogenerate: { directory: 'docs' } }");
    expect(astroConfig).not.toContain('nav-entry-not-found');
  });

  it('writes remark plugin that rewrites markdown and relative asset URLs', async () => {
    const graph = makeGraph(tmpDir, [
      { rel: 'guide/intro.md', label: 'Intro', entryId: 'guide/intro' },
      { rel: 'guide/next.md', label: 'Next', entryId: 'guide/next' },
    ]);

    const adapter = new RuntimeAdapter({
      config: makeConfig(tmpDir),
      graph,
    });

    fs.mkdirSync(adapter.projectDir, { recursive: true });
    await invokePrivate(adapter, 'writeRemarkPlugin');

    const plugin = fs.readFileSync(path.join(adapter.projectDir, 'remark-rewrite-md-links.mjs'), 'utf-8');

    expect(plugin).toContain("visit(tree, 'link', rewriteNodeUrl);");
    expect(plugin).toContain("visit(tree, 'image', rewriteNodeUrl);");
    expect(plugin).toContain("visit(tree, 'definition', rewriteNodeUrl);");
    expect(plugin).toContain("if (/\\.mdx?$/i.test(urlPath)) {");
    expect(plugin).toContain("return '/' + resolved + suffix;");
  });

  it('uses explicit config title when provided', async () => {
    const graph = makeGraph(tmpDir, [
      { rel: 'guide/intro.md', label: 'Intro', entryId: 'guide/intro' },
    ]);

    const adapter = new RuntimeAdapter({
      config: { ...makeConfig(tmpDir), title: 'Math Docs' },
      graph,
    });

    fs.mkdirSync(adapter.projectDir, { recursive: true });
    await invokePrivate(adapter, 'writeAstroConfig');

    const astroConfig = fs.readFileSync(path.join(adapter.projectDir, 'astro.config.mjs'), 'utf-8');
    expect(astroConfig).toContain("title: \"Math Docs\"");
  });

  it('prefers explicit config name over title', async () => {
    const graph = makeGraph(tmpDir, [
      { rel: 'guide/intro.md', label: 'Intro', entryId: 'guide/intro' },
    ]);

    const adapter = new RuntimeAdapter({
      config: { ...makeConfig(tmpDir), name: 'Custom Name', title: 'Math Docs' },
      graph,
    });

    fs.mkdirSync(adapter.projectDir, { recursive: true });
    await invokePrivate(adapter, 'writeAstroConfig');

    const astroConfig = fs.readFileSync(path.join(adapter.projectDir, 'astro.config.mjs'), 'utf-8');
    expect(astroConfig).toContain("title: \"Custom Name\"");
  });

  it('derives title from cwd basename when no explicit title is set', async () => {
    const root = path.join(tmpDir, 'math-tools');
    fs.mkdirSync(root, { recursive: true });

    const graph = makeGraph(root, [
      { rel: 'guide/intro.md', label: 'Intro', entryId: 'guide/intro' },
    ]);

    const adapter = new RuntimeAdapter({
      config: makeConfig(root),
      graph,
    });

    fs.mkdirSync(adapter.projectDir, { recursive: true });
    await invokePrivate(adapter, 'writeAstroConfig');

    const astroConfig = fs.readFileSync(path.join(adapter.projectDir, 'astro.config.mjs'), 'utf-8');
    expect(astroConfig).toContain("title: \"Math Tools\"");
  });
});
