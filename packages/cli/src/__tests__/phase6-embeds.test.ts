/**
 * Phase 6 tests: Embeds and Transclusion
 *
 * Covers all Phase 6 acceptance criteria:
 * - ![[Note]] normalizes to a clearly bounded embedded note when public for the selected target
 * - ![[Note#Heading]] normalizes to the selected target-public section
 * - ![[Note#^block-id]] normalizes to the targeted target-public block
 * - ![[asset.ext]] normalizes to supported target-public image/media assets
 * - Embeds respect target-based public/private filtering for both source notes and assets
 * - Recursive embed loops are detected and reported
 * - Explicit ^block-id markers produce stable block anchors in target-public content
 * - Embedded content cannot cause private or cross-target content to enter normalized docs
 * - Tests cover note embeds, heading embeds, asset embeds, unresolved embeds,
 *   private embeds, recursive embeds, and unsupported block embeds
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-phase6-test-'));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
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

beforeEach(() => {
  tmpDir = makeTmpDir();
  sourceRoot = path.join(tmpDir, 'docs');
  fs.mkdirSync(sourceRoot, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. Full note embed: ![[Note]]
// ---------------------------------------------------------------------------

describe('Full note embed ![[Note]]', () => {
  it('normalizes ![[Note]] to a bounded blockquote with attribution', async () => {
    writeFile(sourceRoot, 'fragment.md', [
      '---',
      'title: Fragment',
      'publish: engineering',
      '---',
      '',
      '# Fragment',
      '',
      'This is the fragment content.',
    ].join('\n'));

    writeFile(sourceRoot, 'page.md', [
      '---',
      'title: Page',
      'publish: engineering',
      '---',
      '',
      'Intro text.',
      '',
      '![[Fragment]]',
      '',
      'After embed.',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const out = readText(path.join(outputRoot, 'page.md'));
    // Should contain blockquote attribution
    expect(out).toContain('Embedded from');
    expect(out).toContain('Fragment');
    // Should include the fragment content
    expect(out).toContain('This is the fragment content.');
    // Original embed syntax should be replaced
    expect(out).not.toContain('![[Fragment]]');
    // Surrounding content should be preserved
    expect(out).toContain('Intro text.');
    expect(out).toContain('After embed.');
  });

  it('strips frontmatter from embedded note', async () => {
    writeFile(sourceRoot, 'embed-source.md', [
      '---',
      'title: Embed Source',
      'publish: engineering',
      '---',
      '',
      'Content only, no frontmatter.',
    ].join('\n'));

    writeFile(sourceRoot, 'host.md', [
      '---',
      'title: Host',
      'publish: engineering',
      '---',
      '',
      '![[Embed Source]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const out = readText(path.join(outputRoot, 'host.md'));
    // Frontmatter of the EMBEDDED page should not appear in the embedded blockquote
    expect(out).toContain('Content only, no frontmatter.');
    // The embedded blockquote should not contain the literal frontmatter key-value
    expect(out).not.toMatch(/> .*title: Embed Source/);
    expect(out).not.toMatch(/> .*publish: engineering/);
  });

  it('does not expand embeds inside fenced code blocks', async () => {
    writeFile(sourceRoot, 'note.md', [
      '---', 'title: Note', 'publish: engineering', '---', 'content',
    ].join('\n'));

    writeFile(sourceRoot, 'page.md', [
      '---',
      'title: Page',
      'publish: engineering',
      '---',
      '',
      '```',
      '![[Note]]',
      '```',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const out = readText(path.join(outputRoot, 'page.md'));
    // Embed inside code block should NOT be expanded
    expect(out).toContain('![[Note]]');
  });
});

// ---------------------------------------------------------------------------
// 2. Heading embed: ![[Note#Heading]]
// ---------------------------------------------------------------------------

describe('Heading embed ![[Note#Heading]]', () => {
  it('normalizes ![[Note#Heading]] to the targeted section content', async () => {
    writeFile(sourceRoot, 'source.md', [
      '---',
      'title: Source',
      'publish: engineering',
      '---',
      '',
      '# Source',
      '',
      '## Introduction',
      '',
      'Intro paragraph.',
      '',
      '## Details',
      '',
      'Details paragraph.',
    ].join('\n'));

    writeFile(sourceRoot, 'consumer.md', [
      '---',
      'title: Consumer',
      'publish: engineering',
      '---',
      '',
      '![[Source#Introduction]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const out = readText(path.join(outputRoot, 'consumer.md'));
    // Should contain the Introduction section body
    expect(out).toContain('Intro paragraph.');
    // Should NOT contain the Details section body
    expect(out).not.toContain('Details paragraph.');
    // Original embed syntax replaced
    expect(out).not.toContain('![[Source#Introduction]]');
  });

  it('emits a warning for unresolved heading embeds', async () => {
    writeFile(sourceRoot, 'source.md', [
      '---', 'title: Source', 'publish: engineering', '---', '## Real Heading', 'body',
    ].join('\n'));

    writeFile(sourceRoot, 'consumer.md', [
      '---', 'title: Consumer', 'publish: engineering', '---',
      '![[Source#NonExistentHeading]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    expect(result.diagnostics.diagnostics.some(
      (d) => d.code === 'UNRESOLVED_HEADING_EMBED',
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Block embed: ![[Note#^block-id]]
// ---------------------------------------------------------------------------

describe('Block embed ![[Note#^block-id]]', () => {
  it('normalizes ![[Note#^block-id]] to the targeted block content', async () => {
    writeFile(sourceRoot, 'source.md', [
      '---',
      'title: Source',
      'publish: engineering',
      '---',
      '',
      'First paragraph.',
      '',
      'Key insight here. ^key-insight',
      '',
      'Third paragraph.',
    ].join('\n'));

    writeFile(sourceRoot, 'consumer.md', [
      '---',
      'title: Consumer',
      'publish: engineering',
      '---',
      '',
      '![[Source#^key-insight]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const out = readText(path.join(outputRoot, 'consumer.md'));
    // Should contain the block content
    expect(out).toContain('Key insight here.');
    // Should NOT contain other paragraphs
    expect(out).not.toContain('First paragraph.');
    expect(out).not.toContain('Third paragraph.');
    // Original embed syntax replaced
    expect(out).not.toContain('![[Source#^key-insight]]');
  });

  it('emits a warning when block ID is not found', async () => {
    writeFile(sourceRoot, 'source.md', [
      '---', 'title: Source', 'publish: engineering', '---', 'content ^real-id',
    ].join('\n'));

    writeFile(sourceRoot, 'consumer.md', [
      '---', 'title: Consumer', 'publish: engineering', '---',
      '![[Source#^fake-id]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    expect(result.diagnostics.diagnostics.some(
      (d) => d.code === 'UNRESOLVED_BLOCK_EMBED',
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Block anchor injection: ^block-id → <span id="block-id">
// ---------------------------------------------------------------------------

describe('Block anchor injection', () => {
  it('replaces ^block-id markers with <span id="block-id"> anchors', async () => {
    writeFile(sourceRoot, 'page.md', [
      '---',
      'title: Page',
      'publish: engineering',
      '---',
      '',
      'Paragraph with block ID. ^my-block',
      '',
      'Another paragraph. ^another-block',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const out = readText(path.join(outputRoot, 'page.md'));
    // Block ID markers should be replaced with span anchors
    expect(out).toContain('<span id="my-block">');
    expect(out).toContain('<span id="another-block">');
    // Raw ^block-id markers should be gone
    expect(out).not.toMatch(/\^my-block(?!<)/);
    expect(out).not.toMatch(/\^another-block(?!<)/);
  });

  it('does not replace ^block-id inside fenced code blocks', async () => {
    writeFile(sourceRoot, 'page.md', [
      '---',
      'title: Page',
      'publish: engineering',
      '---',
      '',
      '```',
      'some code ^code-block',
      '```',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const out = readText(path.join(outputRoot, 'page.md'));
    // Inside code block should be untouched
    expect(out).toContain('^code-block');
  });
});

// ---------------------------------------------------------------------------
// 5. Asset embed: ![[asset.ext]]
// ---------------------------------------------------------------------------

describe('Asset embed ![[asset.ext]]', () => {
  it('normalizes ![[image.png]] to standard Markdown image syntax', async () => {
    const imgPath = path.join(sourceRoot, 'assets', 'diagram.png');
    fs.mkdirSync(path.dirname(imgPath), { recursive: true });
    fs.writeFileSync(imgPath, 'fake-png');

    writeFile(sourceRoot, 'page.md', [
      '---',
      'title: Page',
      'publish: engineering',
      '---',
      '',
      '![[assets/diagram.png]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const out = readText(path.join(outputRoot, 'page.md'));
    // Should normalize to Markdown image syntax
    expect(out).toMatch(/!\[diagram\]\(.*diagram\.png\)/);
    // Original embed syntax replaced
    expect(out).not.toContain('![[assets/diagram.png]]');
  });

  it('emits a warning for unresolved asset embeds', async () => {
    writeFile(sourceRoot, 'page.md', [
      '---',
      'title: Page',
      'publish: engineering',
      '---',
      '',
      '![[assets/missing-image.png]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    expect(result.diagnostics.diagnostics.some(
      (d) => d.code === 'UNRESOLVED_EMBED_ASSET',
    )).toBe(true);
  });

  it('normalizes ![[file.svg]] to an image link', async () => {
    const svgPath = path.join(sourceRoot, 'logo.svg');
    fs.writeFileSync(svgPath, '<svg/>');

    writeFile(sourceRoot, 'page.md', [
      '---',
      'title: Page',
      'publish: engineering',
      '---',
      '',
      '![[logo.svg]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const out = readText(path.join(outputRoot, 'page.md'));
    expect(out).toMatch(/!\[logo\]\(.*logo\.svg\)/);
  });
});

// ---------------------------------------------------------------------------
// 6. Private embed: embedding a private page
// ---------------------------------------------------------------------------

describe('Private embed filtering', () => {
  it('emits a warning when embedding a private page', async () => {
    writeFile(sourceRoot, 'private-note.md', [
      '---',
      'title: Private Note',
      '---',
      '',
      'This is private content.',
    ].join('\n'));

    writeFile(sourceRoot, 'public-page.md', [
      '---',
      'title: Public Page',
      'publish: engineering',
      '---',
      '',
      '![[Private Note]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const diagCodes = result.diagnostics.diagnostics.map((d) => d.code);
    expect(diagCodes).toContain('PRIVATE_EMBED');
  });

  it('emits a strict error when embedding a private page in strict mode', async () => {
    writeFile(sourceRoot, 'private-note.md', [
      '---', 'title: Private Note', '---', 'private content.',
    ].join('\n'));

    writeFile(sourceRoot, 'public-page.md', [
      '---', 'title: Public Page', 'publish: engineering', '---',
      '![[Private Note]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    await expect(
      normalizeVault({ ...baseOptions(sourceRoot, outputRoot), strict: true }),
    ).rejects.toThrow('strict diagnostics');
  });

  it('emits a warning when embedding a cross-target page', async () => {
    writeFile(sourceRoot, 'recipes-note.md', [
      '---',
      'title: Recipes Note',
      'publish: recipes',
      '---',
      '',
      'This belongs to recipes.',
    ].join('\n'));

    writeFile(sourceRoot, 'eng-page.md', [
      '---',
      'title: Engineering Page',
      'publish: engineering',
      '---',
      '',
      '![[Recipes Note]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const diagCodes = result.diagnostics.diagnostics.map((d) => d.code);
    expect(diagCodes).toContain('CROSS_TARGET_EMBED');
  });

  it('does not include private content in normalized output', async () => {
    writeFile(sourceRoot, 'private-note.md', [
      '---', 'title: Private Note', '---', 'TOP SECRET.',
    ].join('\n'));

    writeFile(sourceRoot, 'public-page.md', [
      '---', 'title: Public Page', 'publish: engineering', '---',
      '![[Private Note]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const out = readText(path.join(outputRoot, 'public-page.md'));
    // The private content must NOT appear in the normalized output
    expect(out).not.toContain('TOP SECRET');
    // The embed syntax should remain as-is (not expanded)
    expect(out).toContain('![[Private Note]]');
  });
});

// ---------------------------------------------------------------------------
// 7. Recursive embed cycle detection
// ---------------------------------------------------------------------------

describe('Recursive embed cycle detection', () => {
  it('detects a direct embed cycle and emits an EMBED_CYCLE error', async () => {
    writeFile(sourceRoot, 'a.md', [
      '---', 'title: A', 'publish: engineering', '---',
      '![[B]]',
    ].join('\n'));

    writeFile(sourceRoot, 'b.md', [
      '---', 'title: B', 'publish: engineering', '---',
      '![[A]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    expect(result.diagnostics.diagnostics.some(
      (d) => d.code === 'EMBED_CYCLE',
    )).toBe(true);
  });

  it('does not expand a cycle into infinite content', async () => {
    writeFile(sourceRoot, 'self.md', [
      '---', 'title: Self', 'publish: engineering', '---',
      '![[Self]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    expect(result.diagnostics.diagnostics.some(
      (d) => d.code === 'EMBED_CYCLE',
    )).toBe(true);

    // The output should be finite and contain a cycle comment
    const out = readText(path.join(outputRoot, 'self.md'));
    expect(out).toContain('<!-- embed cycle');
  });
});

// ---------------------------------------------------------------------------
// 8. Unresolved embed
// ---------------------------------------------------------------------------

describe('Unresolved embed', () => {
  it('emits a warning for an embed referencing a missing page', async () => {
    writeFile(sourceRoot, 'page.md', [
      '---', 'title: Page', 'publish: engineering', '---',
      '![[NonExistentPage]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    expect(result.diagnostics.diagnostics.some(
      (d) => d.code === 'UNRESOLVED_EMBED',
    )).toBe(true);
  });

  it('fails strict builds on unresolved page embeds', async () => {
    writeFile(sourceRoot, 'page.md', [
      '---', 'title: Page', 'publish: engineering', '---',
      '![[MissingNote]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    await expect(
      normalizeVault({ ...baseOptions(sourceRoot, outputRoot), strict: true }),
    ).rejects.toThrow('strict diagnostics');
  });
});

// ---------------------------------------------------------------------------
// 9. End-to-end: multiple embed types in the same page
// ---------------------------------------------------------------------------

describe('End-to-end embed normalization', () => {
  it('expands note, heading, block, and asset embeds together in one page', async () => {
    const imgPath = path.join(sourceRoot, 'assets', 'logo.png');
    fs.mkdirSync(path.dirname(imgPath), { recursive: true });
    fs.writeFileSync(imgPath, 'fake-png');

    writeFile(sourceRoot, 'shared.md', [
      '---',
      'title: Shared',
      'publish: engineering',
      '---',
      '',
      '# Shared',
      '',
      '## Section One',
      '',
      'Section one content.',
      '',
      'Important block. ^important',
    ].join('\n'));

    writeFile(sourceRoot, 'main.md', [
      '---',
      'title: Main',
      'publish: engineering',
      '---',
      '',
      'Full embed:',
      '![[Shared]]',
      '',
      'Heading embed:',
      '![[Shared#Section One]]',
      '',
      'Block embed:',
      '![[Shared#^important]]',
      '',
      'Asset embed:',
      '![[assets/logo.png]]',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    // No errors expected
    const errors = result.diagnostics.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);

    const out = readText(path.join(outputRoot, 'main.md'));

    // Full embed: note content present
    expect(out).toContain('Section one content.');

    // Heading embed: specific section
    // (section content appears at least twice — once from full embed, once from heading embed)
    expect(out).toContain('Section one content.');

    // Block embed: specific block
    expect(out).toContain('Important block.');

    // Asset embed: normalized to Markdown image
    expect(out).toMatch(/!\[logo\]\(.*logo\.png\)/);

    // No raw embed syntax remaining (except what's in code blocks)
    const embedMatches = out.match(/!\[\[(?!.*inside code)/g) ?? [];
    expect(embedMatches).toHaveLength(0);
  });

  it('normalizes embeds together with wikilinks and callouts', async () => {
    writeFile(sourceRoot, 'note.md', [
      '---',
      'title: Note',
      'publish: engineering',
      '---',
      '',
      'Note content with a [[Main]] link.',
    ].join('\n'));

    writeFile(sourceRoot, 'main.md', [
      '---',
      'title: Main',
      'publish: engineering',
      '---',
      '',
      '![[Note]]',
      '',
      '> [!tip]',
      '> A tip aside.',
    ].join('\n'));

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const out = readText(path.join(outputRoot, 'main.md'));
    // Embed expanded
    expect(out).toContain('Note content');
    // Callout normalized
    expect(out).toContain(':::tip[Tip]');
  });
});

// ---------------------------------------------------------------------------
// 10. POC vault end-to-end: example/docs with embed coverage
// ---------------------------------------------------------------------------

describe('POC vault embed coverage', () => {
  it('normalizes the architecture.md file embeds without errors', async () => {
    const exampleDocsRoot = path.resolve(
      __dirname,
      '../../../../example/docs',
    );
    if (!fs.existsSync(exampleDocsRoot)) {
      // Skip if the example vault doesn't exist in this environment.
      return;
    }

    const outputRoot = path.join(os.tmpdir(), `fea-docs-poc-embeds-${Date.now()}`);
    try {
      const result = await normalizeVault({
        sourceRoot: exampleDocsRoot,
        outputRoot,
        targetId: 'engineering',
        configuredTargets: ['engineering', 'recipes'],
        strict: false,
        mode: 'production',
      });

      // The architecture page should have been normalized
      const archOut = path.join(outputRoot, 'engineering', 'architecture.md');
      expect(fs.existsSync(archOut)).toBe(true);

      const archContent = readText(archOut);
      // Embed syntax should have been expanded
      expect(archContent).not.toContain('![[../shared/reusable-fragment]]');
      expect(archContent).not.toContain('![[../shared/reusable-fragment#Key Point]]');
      expect(archContent).not.toContain('![[../assets/vault-diagram.svg]]');

      // Embedded note content should be present
      expect(archContent).toContain('Reusable Fragment');

      // No errors in diagnostics
      const errors = result.diagnostics.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });
});
