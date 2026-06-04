import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeVault } from '@fea-docs/normalizer';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-phase2-test-'));
}

function writeFile(root: string, relPath: string, content: string): void {
  const fullPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function baseOptions(sourceRoot: string, outputRoot: string, targetId = 'engineering') {
  return {
    sourceRoot,
    outputRoot,
    targetId,
    configuredTargets: ['engineering', 'recipes'],
    strict: false,
    mode: 'production' as const,
  };
}

// ---------------------------------------------------------------------------

let tmpDir: string;
let sourceRoot: string;

beforeEach(() => {
  tmpDir = makeTmpDir();
  sourceRoot = path.join(tmpDir, 'docs');
  fs.mkdirSync(sourceRoot, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. File discovery
// ---------------------------------------------------------------------------

describe('File discovery', () => {
  it('discovers .md and .mdx files recursively', async () => {
    writeFile(sourceRoot, 'index.md', '---\ntitle: Home\npublish: engineering\n---\n# Home\n');
    writeFile(sourceRoot, 'sub/page.md', '---\ntitle: Sub\npublish: engineering\n---\n# Sub\n');
    writeFile(sourceRoot, 'integration.mdx', '---\ntitle: Int\npublish: engineering\n---\nHi\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    const sources = result.manifest.pages.map((p) => p.sourcePath);
    expect(sources).toContain('index.md');
    expect(sources).toContain('sub/page.md');
    expect(sources).toContain('integration.mdx');
  });

  it('discovers non-Markdown static files', async () => {
    writeFile(sourceRoot, 'index.md', '---\ntitle: Home\npublish: engineering\n---\n![logo](./logo.png)\n');
    writeFile(sourceRoot, 'logo.png', 'PNG');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.staticFiles).toContain('logo.png');
  });

  it('respects .gitignore in the source root', async () => {
    writeFile(sourceRoot, '.gitignore', 'ignored/\n');
    writeFile(sourceRoot, 'index.md', '---\ntitle: Home\npublish: engineering\n---\n');
    writeFile(sourceRoot, 'ignored/secret.md', '---\ntitle: Secret\npublish: engineering\n---\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    const sources = result.manifest.pages.map((p) => p.sourcePath);
    expect(sources).toContain('index.md');
    expect(sources).not.toContain('ignored/secret.md');
  });

  it('respects configured ignore patterns', async () => {
    writeFile(sourceRoot, 'index.md', '---\ntitle: Home\npublish: engineering\n---\n');
    writeFile(sourceRoot, 'tmp/scratchpad.md', '---\ntitle: Scratch\npublish: engineering\n---\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault({
      ...baseOptions(sourceRoot, outputRoot),
      ignore: ['tmp/**'],
    });
    const sources = result.manifest.pages.map((p) => p.sourcePath);
    expect(sources).not.toContain('tmp/scratchpad.md');
  });
});

// ---------------------------------------------------------------------------
// 2. Metadata extraction
// ---------------------------------------------------------------------------

describe('Metadata extraction', () => {
  it('extracts title from frontmatter', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: My Page\npublish: engineering\n---\n# Other\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages[0].title).toBe('My Page');
  });

  it('falls back to first H1 when no frontmatter title', async () => {
    writeFile(sourceRoot, 'page.md', '---\npublish: engineering\n---\n# First H1\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages[0].title).toBe('First H1');
    expect(result.manifest.pages[0].titleFromFilename).toBeFalsy();
  });

  it('falls back to filename when no title or H1', async () => {
    writeFile(sourceRoot, 'my-cool-page.md', '---\npublish: engineering\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages[0].title).toBe('my cool page');
    expect(result.manifest.pages[0].titleFromFilename).toBe(true);
  });

  it('extracts aliases from frontmatter', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\naliases: [Alias One, Alias Two]\n---\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages[0].aliases).toEqual(['Alias One', 'Alias Two']);
  });

  it('extracts single alias string from frontmatter', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\naliases: MyAlias\n---\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages[0].aliases).toEqual(['MyAlias']);
  });

  it('extracts slug from frontmatter', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\nslug: custom-slug\n---\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages[0].slug).toBe('custom-slug');
  });

  it('extracts headings with anchors', async () => {
    writeFile(
      sourceRoot,
      'page.md',
      '---\ntitle: Page\npublish: engineering\n---\n# Heading One\n## Sub Heading\n',
    );
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    const headings = result.manifest.pages[0].headings!;
    expect(headings).toHaveLength(2);
    expect(headings[0]).toMatchObject({ level: 1, text: 'Heading One', anchor: 'heading-one' });
    expect(headings[1]).toMatchObject({ level: 2, text: 'Sub Heading', anchor: 'sub-heading' });
  });

  it('extracts block IDs', async () => {
    writeFile(
      sourceRoot,
      'page.md',
      '---\ntitle: Page\npublish: engineering\n---\nSome text ^block-abc\nOther text ^block-xyz\n',
    );
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages[0].blockIds).toEqual(expect.arrayContaining(['block-abc', 'block-xyz']));
  });

  it('extracts tags from frontmatter', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\ntags: [typescript, docs]\n---\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages[0].tags).toEqual(expect.arrayContaining(['typescript', 'docs']));
  });

  it('records backlinks opt-in', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\nbacklinks: true\n---\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages[0].backlinks).toBe(true);
  });

  it('records pagefind exclusion', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\npagefind: false\n---\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages[0].pagefind).toBe(false);
  });

  it('does not extract headings from fenced code blocks', async () => {
    writeFile(
      sourceRoot,
      'page.md',
      '---\ntitle: Page\npublish: engineering\n---\n# Real Heading\n```\n# Not a heading\n```\n',
    );
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    const headings = result.manifest.pages[0].headings!;
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe('Real Heading');
  });
});

// ---------------------------------------------------------------------------
// 3. Publishing target filtering
// ---------------------------------------------------------------------------

describe('Publishing target filtering', () => {
  it('publishes nothing by default (no frontmatter publish)', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages).toHaveLength(0);
  });

  it('publish: false is treated as non-public', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: false\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages).toHaveLength(0);
  });

  it('publish: engineering makes page public for engineering target', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages).toHaveLength(1);
  });

  it('publish: [engineering, recipes] makes page public for both targets', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: [engineering, recipes]\n---\nContent\n');

    const outEng = path.join(tmpDir, 'out-eng');
    const outRec = path.join(tmpDir, 'out-rec');

    const resultEng = await normalizeVault({ ...baseOptions(sourceRoot, outEng, 'engineering') });
    const resultRec = await normalizeVault({ ...baseOptions(sourceRoot, outRec, 'recipes') });

    expect(resultEng.manifest.pages).toHaveLength(1);
    expect(resultRec.manifest.pages).toHaveLength(1);
  });

  it('page with publish: recipes is excluded from engineering target', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: recipes\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages).toHaveLength(0);
  });

  it('draft: true excludes page in production mode', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\ndraft: true\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages).toHaveLength(0);
  });

  it('ignore patterns win before draft and target filtering', async () => {
    writeFile(sourceRoot, 'ignored/page.md', '---\ntitle: Page\npublish: engineering\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault({ ...baseOptions(sourceRoot, outputRoot), ignore: ['ignored/**'] });
    expect(result.manifest.pages).toHaveLength(0);
  });

  it('unknown publish target warns in development mode', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: unknown-target\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault({ ...baseOptions(sourceRoot, outputRoot), mode: 'development' });
    const warning = result.diagnostics.diagnostics.find((d) => d.code === 'UNKNOWN_PUBLISH_TARGET');
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe('warning');
  });

  it('unknown publish target fails strict validation', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: unknown-target\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    await expect(
      normalizeVault({ ...baseOptions(sourceRoot, outputRoot), strict: true }),
    ).rejects.toThrow('strict diagnostics');
  });

  it('non-target pages are excluded from graph nodes', async () => {
    writeFile(sourceRoot, 'public.md', '---\ntitle: Public\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'private.md', '---\ntitle: Private\npublish: recipes\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));
    const graph = readJson(path.join(outputRoot, 'fea-docs.graph.json')) as { nodes: Array<{ title: string }> };
    expect(graph.nodes.map((n) => n.title)).toContain('Public');
    expect(graph.nodes.map((n) => n.title)).not.toContain('Private');
  });

  it('non-target pages are excluded from search report', async () => {
    writeFile(sourceRoot, 'public.md', '---\ntitle: Public\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'private.md', '---\ntitle: Private\npublish: recipes\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));
    const search = readJson(path.join(outputRoot, 'fea-docs.search.json')) as { pages: Array<{ pageId: string }> };
    const routes = search.pages.map((p) => p.pageId);
    expect(routes).toContain('/public');
    expect(routes).not.toContain('/private');
  });
});

// ---------------------------------------------------------------------------
// 4. Development mode debug diagnostics
// ---------------------------------------------------------------------------

describe('Development mode debug output', () => {
  it('emits FILTERED_DRAFT info diagnostic for draft pages in dev mode', async () => {
    writeFile(sourceRoot, 'draft.md', '---\ntitle: Draft\npublish: engineering\ndraft: true\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault({ ...baseOptions(sourceRoot, outputRoot), mode: 'development' });
    expect(result.diagnostics.diagnostics.some((d) => d.code === 'FILTERED_DRAFT' && d.severity === 'info')).toBe(true);
  });

  it('emits FILTERED_NON_TARGET info diagnostic for non-target pages in dev mode', async () => {
    writeFile(sourceRoot, 'recipes.md', '---\ntitle: Recipes\npublish: recipes\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault({ ...baseOptions(sourceRoot, outputRoot), mode: 'development' });
    expect(result.diagnostics.diagnostics.some((d) => d.code === 'FILTERED_NON_TARGET' && d.severity === 'info')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Strict mode validations
// ---------------------------------------------------------------------------

describe('Strict mode validations', () => {
  it('fails on duplicate routes in strict mode', async () => {
    // section.md and section/index.md both produce route /section.
    writeFile(sourceRoot, 'section.md', '---\ntitle: Section\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'section/index.md', '---\ntitle: Section Index\npublish: engineering\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    await expect(normalizeVault({ ...baseOptions(sourceRoot, outputRoot), strict: true })).rejects.toThrow(
      'strict diagnostics',
    );
  });

  it('warns on duplicate routes in dev mode', async () => {
    writeFile(sourceRoot, 'section.md', '---\ntitle: Section\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'section/index.md', '---\ntitle: Section Index\npublish: engineering\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault({ ...baseOptions(sourceRoot, outputRoot), mode: 'development' });
    expect(result.diagnostics.diagnostics.some((d) => d.code === 'DUPLICATE_SLUG')).toBe(true);
  });

  it('fails on invalid frontmatter title type in strict mode', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: 42\npublish: engineering\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    await expect(normalizeVault({ ...baseOptions(sourceRoot, outputRoot), strict: true })).rejects.toThrow(
      'strict diagnostics',
    );
  });

  it('warns on missing title fallback (filename) in dev mode', async () => {
    writeFile(sourceRoot, 'page.md', '---\npublish: engineering\n---\nContent with no heading\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault({ ...baseOptions(sourceRoot, outputRoot), mode: 'development' });
    expect(result.diagnostics.diagnostics.some((d) => d.code === 'MISSING_TITLE')).toBe(true);
  });

  it('fails on missing title fallback in strict mode', async () => {
    writeFile(sourceRoot, 'page.md', '---\npublish: engineering\n---\nContent with no heading\n');
    const outputRoot = path.join(tmpDir, 'out');
    await expect(normalizeVault({ ...baseOptions(sourceRoot, outputRoot), strict: true })).rejects.toThrow(
      'strict diagnostics',
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Normalized docs tree format
// ---------------------------------------------------------------------------

describe('Normalized docs tree format', () => {
  it('preserves .md extension when no MDX syntax needed', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages[0].format).toBe('md');
    expect(fs.existsSync(path.join(outputRoot, 'page.md'))).toBe(true);
  });

  it('preserves .mdx extension for MDX sources', async () => {
    writeFile(sourceRoot, 'page.mdx', '---\ntitle: Page\npublish: engineering\n---\nimport X from "./x.jsx";\n<X />\n');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.pages[0].format).toBe('mdx');
    expect(fs.existsSync(path.join(outputRoot, 'page.mdx'))).toBe(true);
  });

  it('copies non-Markdown files referenced from target-public pages', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\n![img](./assets/logo.svg)\n');
    writeFile(sourceRoot, 'assets/logo.svg', '<svg/>');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.staticFiles).toContain('assets/logo.svg');
    expect(fs.existsSync(path.join(outputRoot, 'assets/logo.svg'))).toBe(true);
  });

  it('copies assets referenced via Obsidian ![[embed]] syntax', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\n![[diagram.png]]\n');
    writeFile(sourceRoot, 'assets/diagram.png', 'PNG');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.staticFiles).toContain('assets/diagram.png');
  });

  it('does not copy static files unreferenced by target-public pages', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'private-data.csv', 'data');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(result.manifest.staticFiles).not.toContain('private-data.csv');
    expect(fs.existsSync(path.join(outputRoot, 'private-data.csv'))).toBe(false);
  });

  it('copies static files in configured publicAssetDirs', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'public-assets/logo.png', 'PNG');
    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault({
      ...baseOptions(sourceRoot, outputRoot),
      publicAssetDirs: ['public-assets/'],
    });
    expect(result.manifest.staticFiles).toContain('public-assets/logo.png');
  });

  it('preserves relative paths of copied non-Markdown files', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\n![img](assets/nested/img.png)\n');
    writeFile(sourceRoot, 'assets/nested/img.png', 'PNG');
    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));
    expect(fs.existsSync(path.join(outputRoot, 'assets/nested/img.png'))).toBe(true);
  });

  it('fea-docs.manifest.json contains required fields', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\nContent\n');
    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));
    const manifest = readJson(path.join(outputRoot, 'fea-docs.manifest.json')) as Record<string, unknown>;
    expect(manifest.targetId).toBe('engineering');
    expect(manifest.version).toBe(1);
    expect(Array.isArray(manifest.pages)).toBe(true);
    expect(Array.isArray(manifest.staticFiles)).toBe(true);
    expect(Array.isArray(manifest.generatedDataFiles)).toBe(true);
    expect(manifest.diagnostics).toBeDefined();
  });
});
