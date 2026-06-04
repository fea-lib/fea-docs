/**
 * Phase 8 tests: Static Graph Data and Built-In Graph UI
 *
 * Covers all Phase 8 acceptance criteria:
 * - fea-docs.graph.json includes target-public nodes with page ID, title, route, optional tags
 * - fea-docs.graph.json includes target-public edges with source, target, edge type
 * - Private pages, cross-target pages, and private-only references are excluded
 * - Graph output is deterministic across builds for the same source and config
 * - Tests inspect generated fea-docs.graph.json and verify private-content and cross-target exclusion
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeVault } from '@fea-docs/normalizer';
import type { FeaDocsGraph } from '@fea-docs/schema';
import { artifactFileNames } from '@fea-docs/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-phase8-test-'));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
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

let tmpDir: string;
let sourceRoot: string;
let outputRoot: string;

beforeEach(() => {
  tmpDir = makeTmpDir();
  sourceRoot = path.join(tmpDir, 'docs');
  outputRoot = path.join(tmpDir, 'out');
  fs.mkdirSync(sourceRoot, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. Nodes include only target-public pages with required fields
// ---------------------------------------------------------------------------

describe('Graph nodes', () => {
  it('includes target-public nodes with id, title, and route', async () => {
    writeFile(
      sourceRoot,
      'page-a.md',
      '---\ntitle: Page A\npublish: engineering\n---\nContent A.\n',
    );
    writeFile(
      sourceRoot,
      'page-b.md',
      '---\ntitle: Page B\npublish: engineering\n---\nContent B.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    expect(graph.nodes).toHaveLength(2);

    const nodeA = graph.nodes.find((n) => n.route === '/page-a');
    expect(nodeA).toBeDefined();
    expect(nodeA!.id).toBe('/page-a');
    expect(nodeA!.title).toBe('Page A');
    expect(nodeA!.route).toBe('/page-a');

    const nodeB = graph.nodes.find((n) => n.route === '/page-b');
    expect(nodeB).toBeDefined();
    expect(nodeB!.id).toBe('/page-b');
    expect(nodeB!.title).toBe('Page B');
    expect(nodeB!.route).toBe('/page-b');
  });

  it('includes optional tags when present in frontmatter', async () => {
    writeFile(
      sourceRoot,
      'tagged.md',
      '---\ntitle: Tagged\npublish: engineering\ntags: [alpha, beta]\n---\nContent.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    const node = graph.nodes.find((n) => n.route === '/tagged');
    expect(node).toBeDefined();
    expect(node!.tags).toEqual(['alpha', 'beta']);
  });

  it('omits the tags field when no tags are present', async () => {
    writeFile(
      sourceRoot,
      'untagged.md',
      '---\ntitle: Untagged\npublish: engineering\n---\nContent.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    const node = graph.nodes.find((n) => n.route === '/untagged');
    expect(node).toBeDefined();
    expect(node!.tags).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Private pages excluded from graph nodes
// ---------------------------------------------------------------------------

describe('Private page exclusion', () => {
  it('excludes pages with no publish frontmatter', async () => {
    writeFile(sourceRoot, 'public.md', '---\ntitle: Public\npublish: engineering\n---\nPublic.\n');
    writeFile(sourceRoot, 'private.md', '---\ntitle: Private\n---\nPrivate.\n');

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    expect(graph.nodes.some((n) => n.route === '/public')).toBe(true);
    expect(graph.nodes.some((n) => n.title === 'Private')).toBe(false);
  });

  it('excludes pages with publish: false', async () => {
    writeFile(sourceRoot, 'public.md', '---\ntitle: Public\npublish: engineering\n---\nPublic.\n');
    writeFile(
      sourceRoot,
      'explicitly-private.md',
      '---\ntitle: Explicit Private\npublish: false\n---\nPrivate.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    expect(graph.nodes.some((n) => n.title === 'Explicit Private')).toBe(false);
  });

  it('excludes draft pages from production builds', async () => {
    writeFile(sourceRoot, 'published.md', '---\ntitle: Published\npublish: engineering\n---\nOK.\n');
    writeFile(
      sourceRoot,
      'draft.md',
      '---\ntitle: Draft\npublish: engineering\ndraft: true\n---\nDraft.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    expect(graph.nodes.some((n) => n.title === 'Published')).toBe(true);
    expect(graph.nodes.some((n) => n.title === 'Draft')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Cross-target pages excluded from graph nodes
// ---------------------------------------------------------------------------

describe('Cross-target page exclusion', () => {
  it('excludes pages assigned only to a different target', async () => {
    writeFile(
      sourceRoot,
      'engineering-page.md',
      '---\ntitle: Engineering Page\npublish: engineering\n---\nFor engineers.\n',
    );
    writeFile(
      sourceRoot,
      'recipes-page.md',
      '---\ntitle: Recipes Page\npublish: recipes\n---\nFor cooks.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot, 'engineering'));

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    expect(graph.nodes.some((n) => n.title === 'Engineering Page')).toBe(true);
    expect(graph.nodes.some((n) => n.title === 'Recipes Page')).toBe(false);
  });

  it('includes multi-target pages for the selected target', async () => {
    writeFile(
      sourceRoot,
      'shared.md',
      '---\ntitle: Shared\npublish: [engineering, recipes]\n---\nShared.\n',
    );
    writeFile(
      sourceRoot,
      'recipes-only.md',
      '---\ntitle: Recipes Only\npublish: recipes\n---\nOnly recipes.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot, 'engineering'));

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    expect(graph.nodes.some((n) => n.title === 'Shared')).toBe(true);
    expect(graph.nodes.some((n) => n.title === 'Recipes Only')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Edges contain only target-public source/target pairs
// ---------------------------------------------------------------------------

describe('Graph edges', () => {
  it('emits an edge for a wikilink between two target-public pages', async () => {
    writeFile(
      sourceRoot,
      'source.md',
      '---\ntitle: Source\npublish: engineering\n---\nSee [[Target]].\n',
    );
    writeFile(sourceRoot, 'target.md', '---\ntitle: Target\npublish: engineering\n---\nContent.\n');

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    const edge = graph.edges.find((e) => e.source === '/source' && e.target === '/target');
    expect(edge).toBeDefined();
    expect(edge!.type).toBe('wikilink');
  });

  it('does not emit an edge for a wikilink to a private page', async () => {
    writeFile(
      sourceRoot,
      'source.md',
      '---\ntitle: Source\npublish: engineering\n---\nSee [[PrivateNote]].\n',
    );
    writeFile(sourceRoot, 'private-note.md', '---\ntitle: PrivateNote\n---\nPrivate.\n');

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    expect(graph.edges.some((e) => e.target === '/private-note')).toBe(false);
  });

  it('does not emit an edge for a wikilink to a cross-target page', async () => {
    writeFile(
      sourceRoot,
      'source.md',
      '---\ntitle: Source\npublish: engineering\n---\nSee [[RecipePage]].\n',
    );
    writeFile(
      sourceRoot,
      'recipe-page.md',
      '---\ntitle: RecipePage\npublish: recipes\n---\nFor cooks.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot, 'engineering'));

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    expect(graph.edges.some((e) => e.target === '/recipe-page')).toBe(false);
  });

  it('includes correct edge type for wikilinks', async () => {
    writeFile(
      sourceRoot,
      'a.md',
      '---\ntitle: A\npublish: engineering\n---\nSee [[B]].\n',
    );
    writeFile(sourceRoot, 'b.md', '---\ntitle: B\npublish: engineering\n---\nContent.\n');

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    const edge = graph.edges.find((e) => e.source === '/a' && e.target === '/b');
    expect(edge).toBeDefined();
    expect(edge!.type).toBe('wikilink');
  });
});

// ---------------------------------------------------------------------------
// 5. Graph output is deterministic
// ---------------------------------------------------------------------------

describe('Graph determinism', () => {
  it('produces identical graph.json on repeated runs with the same source', async () => {
    writeFile(sourceRoot, 'alpha.md', '---\ntitle: Alpha\npublish: engineering\n---\nAlpha.\n');
    writeFile(sourceRoot, 'beta.md', '---\ntitle: Beta\npublish: engineering\n---\nBeta.\n');
    writeFile(
      sourceRoot,
      'gamma.md',
      '---\ntitle: Gamma\npublish: engineering\n---\nSee [[Alpha]] and [[Beta]].\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));
    const first = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));

    // Second run — clear and re-run.
    fs.rmSync(outputRoot, { recursive: true, force: true });
    await normalizeVault(baseOptions(sourceRoot, outputRoot));
    const second = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));

    expect(first).toEqual(second);
  });

  it('produces consistent node ordering across runs', async () => {
    // Create pages with names that could order differently by insertion vs. sort.
    for (const name of ['zebra', 'apple', 'mango']) {
      writeFile(
        sourceRoot,
        `${name}.md`,
        `---\ntitle: ${name}\npublish: engineering\n---\nContent.\n`,
      );
    }

    await normalizeVault(baseOptions(sourceRoot, outputRoot));
    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));

    // Nodes should appear in a stable order (sorted by id/route alphabetically).
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toEqual([...ids].sort());
  });
});

// ---------------------------------------------------------------------------
// 6. Graph metadata (version, targetId)
// ---------------------------------------------------------------------------

describe('Graph metadata', () => {
  it('emits version: 1 and the correct targetId', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\nContent.\n');

    await normalizeVault(baseOptions(sourceRoot, outputRoot, 'engineering'));

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    expect(graph.version).toBe(1);
    expect(graph.targetId).toBe('engineering');
  });

  it('reflects the selected target in targetId', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: recipes\n---\nContent.\n');

    const out2 = path.join(tmpDir, 'out-recipes');
    await normalizeVault({
      ...baseOptions(sourceRoot, out2, 'recipes'),
    });

    const graph = readJson<FeaDocsGraph>(path.join(out2, artifactFileNames.graph));
    expect(graph.targetId).toBe('recipes');
    expect(graph.nodes.some((n) => n.title === 'Page')).toBe(true);
  });
});
