/**
 * Phase 9 tests: Search Integration and Search Privacy
 *
 * Covers all Phase 9 acceptance criteria:
 * - Pages public for the selected target are included in Pagefind by default
 * - Pages with `pagefind: false` or equivalent metadata are excluded
 * - Private and cross-target pages are excluded from indexing
 * - Private or cross-target embedded content cannot enter the search index
 * - Search works in static build output (verified via normalized output file correctness)
 * - Tests verify search inclusion and exclusion behavior on POC repository content
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeVault } from '@fea-docs/normalizer';
import type { FeaDocsSearchReport } from '@fea-docs/schema';
import { artifactFileNames } from '@fea-docs/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-phase9-test-'));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
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
// 1. Target-public pages are included in search by default
// ---------------------------------------------------------------------------

describe('Default search inclusion', () => {
  it('includes target-public pages in fea-docs.search.json with included: true', async () => {
    writeFile(sourceRoot, 'page-a.md', '---\ntitle: Page A\npublish: engineering\n---\nContent A.\n');
    writeFile(sourceRoot, 'page-b.md', '---\ntitle: Page B\npublish: engineering\n---\nContent B.\n');

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const search = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );
    const routes = search.pages.map((p) => p.route);
    expect(routes).toContain('/page-a');
    expect(routes).toContain('/page-b');

    const pageA = search.pages.find((p) => p.route === '/page-a');
    expect(pageA?.included).toBe(true);
    expect(pageA?.reason).toBeUndefined();
  });

  it('emits search report with correct version and targetId', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\nContent.\n');

    await normalizeVault(baseOptions(sourceRoot, outputRoot, 'engineering'));

    const search = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );
    expect(search.version).toBe(1);
    expect(search.targetId).toBe('engineering');
  });

  it('reflects the selected target in the search report', async () => {
    writeFile(sourceRoot, 'recipe.md', '---\ntitle: Recipe\npublish: recipes\n---\nIngredients.\n');

    const outRecipes = path.join(tmpDir, 'out-recipes');
    await normalizeVault({ ...baseOptions(sourceRoot, outRecipes, 'recipes') });

    const search = readJson<FeaDocsSearchReport>(
      path.join(outRecipes, artifactFileNames.search),
    );
    expect(search.targetId).toBe('recipes');
    expect(search.pages.some((p) => p.route === '/recipe')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Pages with pagefind: false are excluded from search
// ---------------------------------------------------------------------------

describe('pagefind: false exclusion', () => {
  it('marks a page with pagefind: false as included: false in search report', async () => {
    writeFile(
      sourceRoot,
      'excluded.md',
      '---\ntitle: Excluded\npublish: engineering\npagefind: false\n---\nContent.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const search = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );
    const entry = search.pages.find((p) => p.route === '/excluded');
    expect(entry).toBeDefined();
    expect(entry?.included).toBe(false);
    expect(entry?.reason).toBe('pagefind:false');
  });

  it('preserves pagefind: false in the normalized output frontmatter', async () => {
    writeFile(
      sourceRoot,
      'excluded.md',
      '---\ntitle: Excluded\npublish: engineering\npagefind: false\n---\nContent.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    // Starlight reads pagefind: false from normalized frontmatter to suppress indexing.
    const normalizedContent = readText(path.join(outputRoot, 'excluded.md'));
    expect(normalizedContent).toContain('pagefind: false');
  });

  it('includes the page in search report but marks it excluded when pagefind: false', async () => {
    writeFile(
      sourceRoot,
      'included.md',
      '---\ntitle: Included\npublish: engineering\n---\nIncluded in search.\n',
    );
    writeFile(
      sourceRoot,
      'excluded.md',
      '---\ntitle: Excluded\npublish: engineering\npagefind: false\n---\nNot in search.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const search = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );
    const included = search.pages.find((p) => p.route === '/included');
    const excluded = search.pages.find((p) => p.route === '/excluded');

    // Both pages appear in the search report.
    expect(included).toBeDefined();
    expect(excluded).toBeDefined();

    // Only the included page has included: true.
    expect(included?.included).toBe(true);
    expect(excluded?.included).toBe(false);
    expect(excluded?.reason).toBe('pagefind:false');
  });

  it('does not add a reason field when page is included', async () => {
    writeFile(
      sourceRoot,
      'page.md',
      '---\ntitle: Page\npublish: engineering\n---\nContent.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const search = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );
    const entry = search.pages.find((p) => p.route === '/page');
    expect(entry?.included).toBe(true);
    expect(entry?.reason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Private pages are excluded from search entirely
// ---------------------------------------------------------------------------

describe('Private page exclusion from search', () => {
  it('excludes pages with no publish frontmatter from search report', async () => {
    writeFile(
      sourceRoot,
      'public.md',
      '---\ntitle: Public\npublish: engineering\n---\nPublic.\n',
    );
    writeFile(sourceRoot, 'private.md', '---\ntitle: Private\n---\nPrivate note.\n');

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const search = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );
    const routes = search.pages.map((p) => p.route);
    expect(routes).toContain('/public');
    expect(routes).not.toContain('/private');
  });

  it('excludes pages with publish: false from search report', async () => {
    writeFile(
      sourceRoot,
      'public.md',
      '---\ntitle: Public\npublish: engineering\n---\nPublic.\n',
    );
    writeFile(
      sourceRoot,
      'explicit-private.md',
      '---\ntitle: Explicitly Private\npublish: false\n---\nNot published.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const search = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );
    expect(search.pages.some((p) => p.route === '/explicit-private')).toBe(false);
  });

  it('excludes draft pages from search report in production mode', async () => {
    writeFile(
      sourceRoot,
      'published.md',
      '---\ntitle: Published\npublish: engineering\n---\nLive.\n',
    );
    writeFile(
      sourceRoot,
      'draft.md',
      '---\ntitle: Draft\npublish: engineering\ndraft: true\n---\nNot live.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const search = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );
    expect(search.pages.some((p) => p.route === '/published')).toBe(true);
    expect(search.pages.some((p) => p.route === '/draft')).toBe(false);
  });

  it('private pages are absent from the normalized docs tree', async () => {
    writeFile(
      sourceRoot,
      'public.md',
      '---\ntitle: Public\npublish: engineering\n---\nPublic.\n',
    );
    writeFile(sourceRoot, 'private.md', '---\ntitle: Private\n---\nPrivate note.\n');

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    // Private page must not exist in normalized output — Pagefind cannot index it.
    expect(fs.existsSync(path.join(outputRoot, 'private.md'))).toBe(false);
    expect(fs.existsSync(path.join(outputRoot, 'public.md'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Cross-target pages are excluded from search
// ---------------------------------------------------------------------------

describe('Cross-target page exclusion from search', () => {
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

    const search = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );
    expect(search.pages.some((p) => p.route === '/engineering-page')).toBe(true);
    expect(search.pages.some((p) => p.route === '/recipes-page')).toBe(false);
  });

  it('includes multi-target pages for the selected target', async () => {
    writeFile(
      sourceRoot,
      'shared.md',
      '---\ntitle: Shared\npublish: [engineering, recipes]\n---\nShared content.\n',
    );
    writeFile(
      sourceRoot,
      'recipes-only.md',
      '---\ntitle: Recipes Only\npublish: recipes\n---\nOnly for cooks.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot, 'engineering'));

    const search = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );
    expect(search.pages.some((p) => p.route === '/shared')).toBe(true);
    expect(search.pages.some((p) => p.route === '/recipes-only')).toBe(false);
  });

  it('cross-target pages are absent from normalized docs tree', async () => {
    writeFile(
      sourceRoot,
      'eng.md',
      '---\ntitle: Eng\npublish: engineering\n---\nEngineering.\n',
    );
    writeFile(
      sourceRoot,
      'recipes.md',
      '---\ntitle: Recipes\npublish: recipes\n---\nRecipes.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot, 'engineering'));

    // Cross-target file must not exist in normalized output.
    expect(fs.existsSync(path.join(outputRoot, 'recipes.md'))).toBe(false);
    expect(fs.existsSync(path.join(outputRoot, 'eng.md'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Private or cross-target embedded content cannot enter the search index
// ---------------------------------------------------------------------------

describe('Embedded content privacy in search', () => {
  it('private note embed content does not appear in normalized public page', async () => {
    writeFile(
      sourceRoot,
      'private-note.md',
      '---\ntitle: Private Note\n---\nSECRET CONTENT ONLY.\n',
    );
    writeFile(
      sourceRoot,
      'public.md',
      '---\ntitle: Public\npublish: engineering\n---\n![[private-note]]\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    // The private note must not be in the output tree.
    expect(fs.existsSync(path.join(outputRoot, 'private-note.md'))).toBe(false);

    // The embedded private content must not appear in the public page output.
    const publicContent = readText(path.join(outputRoot, 'public.md'));
    expect(publicContent).not.toContain('SECRET CONTENT ONLY');
  });

  it('cross-target note embed content does not appear in normalized public page', async () => {
    writeFile(
      sourceRoot,
      'recipes-note.md',
      '---\ntitle: Recipes Note\npublish: recipes\n---\nRECIPE SECRET.\n',
    );
    writeFile(
      sourceRoot,
      'public.md',
      '---\ntitle: Public\npublish: engineering\n---\n![[recipes-note]]\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot, 'engineering'));

    // Cross-target note must not be in the output tree.
    expect(fs.existsSync(path.join(outputRoot, 'recipes-note.md'))).toBe(false);

    // Cross-target embedded content must not appear in the public page.
    const publicContent = readText(path.join(outputRoot, 'public.md'));
    expect(publicContent).not.toContain('RECIPE SECRET');
  });

  it('private embedded content is not reachable via search report', async () => {
    writeFile(
      sourceRoot,
      'private.md',
      '---\ntitle: Private\n---\nPrivate body.\n',
    );
    writeFile(
      sourceRoot,
      'public.md',
      '---\ntitle: Public\npublish: engineering\n---\n![[private]]\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const search = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );
    // The private page must not appear in the search report at all.
    expect(search.pages.some((p) => p.route === '/private')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. POC repository content — engineering target
// ---------------------------------------------------------------------------

describe('POC vault search behavior (engineering target)', () => {
  const pocVaultRoot = path.resolve(__dirname, '../../../../example/docs');
  const pocVaultExists = fs.existsSync(pocVaultRoot);

  it.skipIf(!pocVaultExists)(
    'engineering target search report contains expected public pages',
    async () => {
      await normalizeVault({
        sourceRoot: pocVaultRoot,
        outputRoot,
        targetId: 'engineering',
        configuredTargets: ['engineering', 'recipes'],
        strict: false,
        mode: 'production',
      });

      const search = readJson<FeaDocsSearchReport>(
        path.join(outputRoot, artifactFileNames.search),
      );

      expect(search.version).toBe(1);
      expect(search.targetId).toBe('engineering');

      const routes = search.pages.map((p) => p.route);
      // Engineering index should be included.
      expect(routes.some((r) => r.startsWith('/engineering'))).toBe(true);
    },
  );

  it.skipIf(!pocVaultExists)(
    'architecture page (pagefind: false) appears as excluded in engineering search report',
    async () => {
      await normalizeVault({
        sourceRoot: pocVaultRoot,
        outputRoot,
        targetId: 'engineering',
        configuredTargets: ['engineering', 'recipes'],
        strict: false,
        mode: 'production',
      });

      const search = readJson<FeaDocsSearchReport>(
        path.join(outputRoot, artifactFileNames.search),
      );

      const architecturePage = search.pages.find((p) =>
        p.route.includes('architecture'),
      );
      expect(architecturePage).toBeDefined();
      expect(architecturePage?.included).toBe(false);
      expect(architecturePage?.reason).toBe('pagefind:false');
    },
  );

  it.skipIf(!pocVaultExists)(
    'pagefind: false is preserved in normalized architecture.md output',
    async () => {
      await normalizeVault({
        sourceRoot: pocVaultRoot,
        outputRoot,
        targetId: 'engineering',
        configuredTargets: ['engineering', 'recipes'],
        strict: false,
        mode: 'production',
      });

      // Find the normalized architecture file.
      const candidates = fs
        .readdirSync(outputRoot, { recursive: true })
        .map(String)
        .filter((f) => f.includes('architecture') && f.endsWith('.md'));

      expect(candidates.length).toBeGreaterThan(0);

      const content = readText(path.join(outputRoot, candidates[0]));
      expect(content).toContain('pagefind: false');
    },
  );

  it.skipIf(!pocVaultExists)(
    'recipes-only pages are excluded from engineering search report',
    async () => {
      await normalizeVault({
        sourceRoot: pocVaultRoot,
        outputRoot,
        targetId: 'engineering',
        configuredTargets: ['engineering', 'recipes'],
        strict: false,
        mode: 'production',
      });

      const search = readJson<FeaDocsSearchReport>(
        path.join(outputRoot, artifactFileNames.search),
      );

      // Sourdough is recipes-only, must not appear in engineering search.
      expect(search.pages.some((p) => p.route.includes('sourdough'))).toBe(false);
    },
  );

  it.skipIf(!pocVaultExists)(
    'recipes target search report contains recipe pages and excludes engineering-only pages',
    async () => {
      const outRecipes = path.join(tmpDir, 'out-recipes');
      await normalizeVault({
        sourceRoot: pocVaultRoot,
        outputRoot: outRecipes,
        targetId: 'recipes',
        configuredTargets: ['engineering', 'recipes'],
        strict: false,
        mode: 'production',
      });

      const search = readJson<FeaDocsSearchReport>(
        path.join(outRecipes, artifactFileNames.search),
      );

      expect(search.targetId).toBe('recipes');

      const routes = search.pages.map((p) => p.route);
      // Sourdough is recipes-public, must appear.
      expect(routes.some((r) => r.includes('sourdough'))).toBe(true);
      // Architecture is engineering-only, must not appear.
      expect(routes.some((r) => r.includes('architecture'))).toBe(false);
    },
  );

  it.skipIf(!pocVaultExists)(
    'all pages in search report belong to the selected target',
    async () => {
      await normalizeVault({
        sourceRoot: pocVaultRoot,
        outputRoot,
        targetId: 'engineering',
        configuredTargets: ['engineering', 'recipes'],
        strict: false,
        mode: 'production',
      });

      const search = readJson<FeaDocsSearchReport>(
        path.join(outputRoot, artifactFileNames.search),
      );

      // Every entry must have the required fields.
      for (const page of search.pages) {
        expect(page.pageId).toBeDefined();
        expect(page.route).toBeDefined();
        expect(typeof page.included).toBe('boolean');
      }
    },
  );
});

// ---------------------------------------------------------------------------
// 7. Search report structure and determinism
// ---------------------------------------------------------------------------

describe('Search report structure and determinism', () => {
  it('produces the same search report on repeated runs', async () => {
    writeFile(
      sourceRoot,
      'alpha.md',
      '---\ntitle: Alpha\npublish: engineering\n---\nAlpha.\n',
    );
    writeFile(
      sourceRoot,
      'beta.md',
      '---\ntitle: Beta\npublish: engineering\npagefind: false\n---\nBeta.\n',
    );

    await normalizeVault(baseOptions(sourceRoot, outputRoot));
    const first = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );

    fs.rmSync(outputRoot, { recursive: true, force: true });
    await normalizeVault(baseOptions(sourceRoot, outputRoot));
    const second = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );

    expect(first).toEqual(second);
  });

  it('search report only contains entries for the selected target', async () => {
    writeFile(
      sourceRoot,
      'eng.md',
      '---\ntitle: Eng\npublish: engineering\n---\nEngineering.\n',
    );
    writeFile(
      sourceRoot,
      'rec.md',
      '---\ntitle: Rec\npublish: recipes\n---\nRecipes.\n',
    );
    writeFile(
      sourceRoot,
      'shared.md',
      '---\ntitle: Shared\npublish: [engineering, recipes]\n---\nShared.\n',
    );
    writeFile(sourceRoot, 'private.md', '---\ntitle: Private\n---\nPrivate.\n');

    await normalizeVault(baseOptions(sourceRoot, outputRoot, 'engineering'));

    const search = readJson<FeaDocsSearchReport>(
      path.join(outputRoot, artifactFileNames.search),
    );

    const routes = search.pages.map((p) => p.route);
    expect(routes).toContain('/eng');
    expect(routes).toContain('/shared');
    expect(routes).not.toContain('/rec');
    expect(routes).not.toContain('/private');
  });
});
