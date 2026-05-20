import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CONTENT_GLOB_PATTERNS, RuntimeAdapter } from '../runtime/adapter.js';
import type { DocsGraph, NavTree, ResolvedConfig } from '../types.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-runtime-test-'));
}

function makeConfig(root: string): ResolvedConfig {
  return {
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

async function invokePrivate(adapter: RuntimeAdapter, method: 'writeContentConfig' | 'writeContentLinks' | 'writeAstroConfig'): Promise<void> {
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
      navTree: [{ label: 'Secrets', entryId: '.secrets/readme', isSectionIndex: true }],
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

  it('routes missing nav entry ids to entry-not-found page with a warning badge', async () => {
    const graph = makeGraph(tmpDir, [
      { rel: 'guide/intro.md', label: 'Intro', entryId: 'guide/intro' },
    ]);
    const navTree: NavTree = [
      { label: 'Intro', entryId: 'guide/intro' },
      { label: 'Secrets', entryId: '.secrets/readme' },
      {
        label: 'Guides',
        entryId: 'guide/missing-index',
        children: [{ label: 'Intro', entryId: 'guide/intro' }],
      },
    ];

    const adapter = new RuntimeAdapter({
      config: makeConfig(tmpDir),
      graph,
      navTree,
    });

    fs.mkdirSync(path.join(adapter.projectDir, 'src', 'content'), { recursive: true });
    fs.mkdirSync(path.join(adapter.projectDir, 'src', 'pages'), { recursive: true });

    await invokePrivate(adapter, 'writeContentLinks');
    await invokePrivate(adapter, 'writeAstroConfig');

    const astroConfig = fs.readFileSync(path.join(adapter.projectDir, 'astro.config.mjs'), 'utf-8');
    const issues = adapter.getNavVerificationIssues();
    const missingPage = fs.readFileSync(
      path.join(tmpDir, '.fea-docs', 'app', 'src', 'pages', '__fea-docs', 'nav-entry-not-found', 'index.astro'),
      'utf-8',
    );

    expect(issues).toHaveLength(2);
    expect(issues.some((i) => i.entryId === '.secrets/readme')).toBe(true);
    expect(issues.some((i) => i.entryId === 'guide/missing-index')).toBe(true);

    expect(astroConfig).toContain("{\n    \"slug\": \"guide/intro\"\n  }");
    expect(astroConfig).toContain('"text": "Missing"');
    expect(astroConfig).toContain('"variant": "caution"');
    expect(astroConfig).toContain('/__fea-docs/nav-entry-not-found/?missing=.secrets%2Freadme&label=Secrets');
    expect(astroConfig).toContain('/__fea-docs/nav-entry-not-found/?missing=guide%2Fmissing-index&label=Guides');
    expect(missingPage).toContain("frontmatter={{ title: 'Entry Not Found' }}");
    expect(missingPage).toContain("Astro.url.searchParams.get('missing')");
    expect(missingPage).toContain('<code>{missing}</code>');
  });
});
