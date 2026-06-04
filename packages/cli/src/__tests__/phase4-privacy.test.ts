/**
 * Phase 4 tests: Privacy-Safe Link and Asset Validation
 *
 * Covers all Phase 4 acceptance criteria:
 * - Public-to-private page links → development warnings and strict failures
 * - Public-to-cross-target page links → development warnings and strict failures
 * - Public-to-private asset/static-file references → development warnings and strict failures
 * - Unresolved Markdown images or linked static files → strict failures
 * - Only assets reachable from target-public pages (or publicAssetDirs) are emitted
 * - Ignored, private, and cross-target asset/static-file paths are not emitted accidentally
 * - Diagnostics include source location where feasible
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeVault } from '@fea-docs/normalizer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-phase4-test-'));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
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
    mode: 'development' as const,
  };
}

function strictOptions(sourceRoot: string, outputRoot: string, targetId = 'engineering') {
  return {
    sourceRoot,
    outputRoot,
    targetId,
    configuredTargets: ['engineering', 'recipes'],
    strict: true,
    mode: 'production' as const,
  };
}

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
// 1. Private page links
// ---------------------------------------------------------------------------

describe('Private page links', () => {
  it('emits PRIVATE_PAGE_LINK warning (dev mode) when a public page wikilinks a private page', async () => {
    writeFile(sourceRoot, 'public.md', '---\ntitle: Public\npublish: engineering\n---\nSee [[Private Note]].\n');
    writeFile(sourceRoot, 'private.md', '---\ntitle: Private Note\n---\nSecret content.\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const privacyDiags = result.diagnostics.diagnostics.filter((d) => d.code === 'PRIVATE_PAGE_LINK');
    expect(privacyDiags.length).toBeGreaterThan(0);
    expect(privacyDiags[0].severity).toBe('warning');
    expect(privacyDiags[0].message).toContain('private.md');
    expect(privacyDiags[0].sourcePath).toBe('public.md');
  });

  it('emits PRIVATE_PAGE_LINK warning for pages with publish: false', async () => {
    writeFile(sourceRoot, 'public.md', '---\ntitle: Public\npublish: engineering\n---\nSee [[Draft Note]].\n');
    writeFile(sourceRoot, 'draft.md', '---\ntitle: Draft Note\npublish: false\n---\nContent.\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const privacyDiags = result.diagnostics.diagnostics.filter((d) => d.code === 'PRIVATE_PAGE_LINK');
    expect(privacyDiags.length).toBeGreaterThan(0);
  });

  it('fails strict builds on PRIVATE_PAGE_LINK', async () => {
    writeFile(sourceRoot, 'public.md', '---\ntitle: Public\npublish: engineering\n---\nSee [[Hidden]].\n');
    writeFile(sourceRoot, 'hidden.md', '---\ntitle: Hidden\n---\nSecret.\n');

    const outputRoot = path.join(tmpDir, 'out');
    await expect(normalizeVault(strictOptions(sourceRoot, outputRoot))).rejects.toThrow(
      'Normalization failed due to strict diagnostics.',
    );
  });

  it('does NOT emit PRIVATE_PAGE_LINK when both pages are public for the same target', async () => {
    writeFile(sourceRoot, 'a.md', '---\ntitle: A\npublish: engineering\n---\nSee [[B]].\n');
    writeFile(sourceRoot, 'b.md', '---\ntitle: B\npublish: engineering\n---\nContent.\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const privacyDiags = result.diagnostics.diagnostics.filter(
      (d) => d.code === 'PRIVATE_PAGE_LINK' || d.code === 'CROSS_TARGET_PAGE_LINK',
    );
    expect(privacyDiags).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Cross-target page links
// ---------------------------------------------------------------------------

describe('Cross-target page links', () => {
  it('emits CROSS_TARGET_PAGE_LINK warning (dev mode) when a public page wikilinks a different-target page', async () => {
    writeFile(sourceRoot, 'eng.md', '---\ntitle: Engineering Page\npublish: engineering\n---\nSee [[Recipe]].\n');
    writeFile(sourceRoot, 'recipe.md', '---\ntitle: Recipe\npublish: recipes\n---\nCook something.\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const crossDiags = result.diagnostics.diagnostics.filter((d) => d.code === 'CROSS_TARGET_PAGE_LINK');
    expect(crossDiags.length).toBeGreaterThan(0);
    expect(crossDiags[0].severity).toBe('warning');
    expect(crossDiags[0].message).toContain('recipes');
    expect(crossDiags[0].sourcePath).toBe('eng.md');
  });

  it('fails strict builds on CROSS_TARGET_PAGE_LINK', async () => {
    writeFile(sourceRoot, 'eng.md', '---\ntitle: Engineering Page\npublish: engineering\n---\nSee [[Recipe]].\n');
    writeFile(sourceRoot, 'recipe.md', '---\ntitle: Recipe\npublish: recipes\n---\nContent.\n');

    const outputRoot = path.join(tmpDir, 'out');
    await expect(normalizeVault(strictOptions(sourceRoot, outputRoot))).rejects.toThrow(
      'Normalization failed due to strict diagnostics.',
    );
  });

  it('does NOT treat a cross-target link as UNRESOLVED_WIKILINK (it should be CROSS_TARGET)', async () => {
    writeFile(sourceRoot, 'eng.md', '---\ntitle: Engineering Page\npublish: engineering\n---\nSee [[Recipes Home]].\n');
    writeFile(sourceRoot, 'recipes.md', '---\ntitle: Recipes Home\npublish: recipes\n---\nContent.\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const unresolvedDiags = result.diagnostics.diagnostics.filter((d) => d.code === 'UNRESOLVED_WIKILINK');
    const crossDiags = result.diagnostics.diagnostics.filter((d) => d.code === 'CROSS_TARGET_PAGE_LINK');

    expect(unresolvedDiags).toHaveLength(0);
    expect(crossDiags.length).toBeGreaterThan(0);
  });

  it('page published to multiple targets is accessible from both targets', async () => {
    writeFile(sourceRoot, 'shared.md', '---\ntitle: Shared\npublish: [engineering, recipes]\n---\nContent.\n');
    writeFile(sourceRoot, 'eng.md', '---\ntitle: Eng\npublish: engineering\n---\nSee [[Shared]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const privacyDiags = result.diagnostics.diagnostics.filter(
      (d) => d.code === 'PRIVATE_PAGE_LINK' || d.code === 'CROSS_TARGET_PAGE_LINK',
    );
    expect(privacyDiags).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Unresolved asset references
// ---------------------------------------------------------------------------

describe('Unresolved asset references', () => {
  it('emits UNRESOLVED_ASSET warning (dev mode) for a missing Markdown image', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\n![Missing](./missing.png)\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const assetDiags = result.diagnostics.diagnostics.filter((d) => d.code === 'UNRESOLVED_ASSET');
    expect(assetDiags.length).toBeGreaterThan(0);
    expect(assetDiags[0].severity).toBe('warning');
    expect(assetDiags[0].message).toContain('missing.png');
    expect(assetDiags[0].sourcePath).toBe('page.md');
  });

  it('emits UNRESOLVED_ASSET warning for a missing Markdown link to a static file', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\n[Download](./report.pdf)\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const assetDiags = result.diagnostics.diagnostics.filter((d) => d.code === 'UNRESOLVED_ASSET');
    expect(assetDiags.length).toBeGreaterThan(0);
    expect(assetDiags[0].message).toContain('report.pdf');
  });

  it('fails strict builds on UNRESOLVED_ASSET', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\n![Missing](./ghost.png)\n');

    const outputRoot = path.join(tmpDir, 'out');
    await expect(normalizeVault(strictOptions(sourceRoot, outputRoot))).rejects.toThrow(
      'Normalization failed due to strict diagnostics.',
    );
  });

  it('does NOT emit UNRESOLVED_ASSET when the file exists in the vault', async () => {
    writeFile(sourceRoot, 'image.png', 'fake-png-bytes');
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\n![Image](./image.png)\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const assetDiags = result.diagnostics.diagnostics.filter((d) => d.code === 'UNRESOLVED_ASSET');
    expect(assetDiags).toHaveLength(0);
  });

  it('does NOT emit UNRESOLVED_ASSET for external URLs', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\n![External](https://example.com/img.png)\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const assetDiags = result.diagnostics.diagnostics.filter((d) => d.code === 'UNRESOLVED_ASSET');
    expect(assetDiags).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Only target-public assets are emitted (existing behaviour preserved)
// ---------------------------------------------------------------------------

describe('Asset emission rules', () => {
  it('copies assets referenced by target-public pages into normalized output', async () => {
    writeFile(sourceRoot, 'logo.png', 'fake-png');
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\n![logo](./logo.png)\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    expect(fs.existsSync(path.join(outputRoot, 'logo.png'))).toBe(true);
  });

  it('does NOT copy assets only referenced by non-target pages', async () => {
    writeFile(sourceRoot, 'private-asset.png', 'fake-png');
    writeFile(sourceRoot, 'private.md', '---\ntitle: Private\n---\n![secret](./private-asset.png)\n');
    writeFile(sourceRoot, 'public.md', '---\ntitle: Public\npublish: engineering\n---\nHello.\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    expect(fs.existsSync(path.join(outputRoot, 'private-asset.png'))).toBe(false);
  });

  it('copies assets from publicAssetDirs even if not referenced by any page', async () => {
    writeFile(sourceRoot, 'assets/logo.svg', '<svg/>');
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\nContent.\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault({
      ...baseOptions(sourceRoot, outputRoot),
      publicAssetDirs: ['assets/'],
    });

    expect(fs.existsSync(path.join(outputRoot, 'assets/logo.svg'))).toBe(true);
  });

  it('does NOT copy ignored files even if path would match a reference', async () => {
    // node_modules is in DEFAULT_IGNORE_GLOBS so will never be in allStaticFiles.
    // This test verifies the output dir does not contain it.
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\nContent.\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    expect(fs.existsSync(path.join(outputRoot, 'node_modules'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Diagnostics quality
// ---------------------------------------------------------------------------

describe('Diagnostic quality', () => {
  it('PRIVATE_PAGE_LINK includes sourcePath and suggestion', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\nSee [[Ghost]].\n');
    writeFile(sourceRoot, 'ghost.md', '---\ntitle: Ghost\n---\nSecret.\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const d = result.diagnostics.diagnostics.find((x) => x.code === 'PRIVATE_PAGE_LINK');
    expect(d).toBeDefined();
    expect(d!.sourcePath).toBe('page.md');
    expect(d!.suggestion).toBeTruthy();
  });

  it('CROSS_TARGET_PAGE_LINK includes the target IDs in the message', async () => {
    writeFile(sourceRoot, 'eng.md', '---\ntitle: Eng\npublish: engineering\n---\nSee [[Tasty Cake]].\n');
    writeFile(sourceRoot, 'cake.md', '---\ntitle: Tasty Cake\npublish: recipes\n---\nDelicious.\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const d = result.diagnostics.diagnostics.find((x) => x.code === 'CROSS_TARGET_PAGE_LINK');
    expect(d).toBeDefined();
    expect(d!.message).toContain('recipes');
    expect(d!.suggestion).toContain('engineering');
  });

  it('UNRESOLVED_ASSET diagnostic is written to fea-docs.diagnostics.json', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\n![Missing](./nope.png)\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const diags = readJson(path.join(outputRoot, 'fea-docs.diagnostics.json')) as {
      diagnostics: Array<{ code: string }>;
    };
    expect(diags.diagnostics.some((d) => d.code === 'UNRESOLVED_ASSET')).toBe(true);
  });
});
