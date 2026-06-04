/**
 * Phase 5 tests: Isolated Syntax Normalization Engine and Callouts
 *
 * Covers all Phase 5 acceptance criteria:
 * - @fea-docs/syntax-engine exposes a clear input/output contract independent of CLI internals
 * - @fea-docs/syntax-engine can register @fea-docs/obsidian handlers without coupling
 * - Engine contract is suitable for reuse (standalone, no publishing deps)
 * - > [!note], > [!info], > [!tip], > [!warning], > [!danger], > [!question] render with predictable styles
 * - Custom callout titles are preserved
 * - Markdown inside callout bodies renders correctly
 * - Nested callouts do not corrupt surrounding page structure
 * - Foldable callouts render with accessible semantics (details/summary fallback)
 * - Unknown callout types render safely with a default style
 * - Callout normalization does not break MDX component usage nearby
 * - Tests cover common types, custom titles, nested cases, foldable markers, unknown types, MDX-adjacent content
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSyntaxEngine } from '@fea-docs/syntax-engine';
import { createObsidianHandlers } from '@fea-docs/obsidian';
import { normalizeVault } from '@fea-docs/normalizer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-phase5-test-'));
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
// 1. Engine contract — standalone usage, no CLI/publishing deps
// ---------------------------------------------------------------------------

describe('@fea-docs/syntax-engine contract', () => {
  it('creates an engine with no handlers and returns input unchanged', async () => {
    const engine = createSyntaxEngine();
    const result = await engine.transform({ path: 'test.md', content: 'Hello world', format: 'md' });
    expect(result.content).toBe('Hello world');
    expect(result.format).toBe('md');
    expect(result.diagnostics).toEqual([]);
  });

  it('chains multiple handlers in registration order', async () => {
    const engine = createSyntaxEngine([
      {
        name: 'step-a',
        transform: (doc) => ({ content: doc.content + ' A', format: doc.format, diagnostics: [] }),
      },
      {
        name: 'step-b',
        transform: (doc) => ({ content: doc.content + ' B', format: doc.format, diagnostics: [] }),
      },
    ]);
    const result = await engine.transform({ path: 'test.md', content: 'X', format: 'md' });
    expect(result.content).toBe('X A B');
  });

  it('accumulates diagnostics from all handlers', async () => {
    const engine = createSyntaxEngine([
      {
        name: 'h1',
        transform: (doc) => ({
          content: doc.content,
          format: doc.format,
          diagnostics: [{ code: 'D1', severity: 'warning', message: 'w1' }],
        }),
      },
      {
        name: 'h2',
        transform: (doc) => ({
          content: doc.content,
          format: doc.format,
          diagnostics: [{ code: 'D2', severity: 'info', message: 'i1' }],
        }),
      },
    ]);
    const result = await engine.transform({ path: 'test.md', content: '', format: 'md' });
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0].code).toBe('D1');
    expect(result.diagnostics[1].code).toBe('D2');
  });

  it('can register @fea-docs/obsidian handlers without any CLI or publishing imports', () => {
    const handlers = createObsidianHandlers({ callouts: true });
    expect(handlers.length).toBeGreaterThan(0);
    const engine = createSyntaxEngine(handlers);
    expect(engine.handlers).toHaveLength(handlers.length);
  });

  it('preserves format through the handler chain', async () => {
    const engine = createSyntaxEngine(createObsidianHandlers());
    const result = await engine.transform({ path: 'page.mdx', content: 'text', format: 'mdx' });
    expect(result.format).toBe('mdx');
  });
});

// ---------------------------------------------------------------------------
// 2. Callout type mapping (common types)
// ---------------------------------------------------------------------------

describe('Callout type mapping', () => {
  async function transformCallout(calloutMd: string): Promise<string> {
    const engine = createSyntaxEngine(createObsidianHandlers({ callouts: true }));
    const result = await engine.transform({ path: 'test.md', content: calloutMd, format: 'md' });
    return result.content;
  }

  it('renders > [!note] as :::note aside', async () => {
    const out = await transformCallout('> [!note]\n> body text\n');
    expect(out).toContain(':::note[Note]');
    expect(out).toContain(':::');
    expect(out).toContain('body text');
  });

  it('renders > [!info] as :::note aside', async () => {
    const out = await transformCallout('> [!info]\n> some info\n');
    expect(out).toContain(':::note[Info]');
  });

  it('renders > [!tip] as :::tip aside', async () => {
    const out = await transformCallout('> [!tip]\n> a tip\n');
    expect(out).toContain(':::tip[Tip]');
  });

  it('renders > [!warning] as :::caution aside', async () => {
    const out = await transformCallout('> [!warning]\n> take care\n');
    expect(out).toContain(':::caution[Warning]');
  });

  it('renders > [!danger] as :::danger aside', async () => {
    const out = await transformCallout('> [!danger]\n> do not proceed\n');
    expect(out).toContain(':::danger[Danger]');
  });

  it('renders > [!question] as :::note aside', async () => {
    const out = await transformCallout('> [!question]\n> answer?\n');
    expect(out).toContain(':::note[Question]');
  });

  it('renders > [!hint] as :::tip aside', async () => {
    const out = await transformCallout('> [!hint]\n> hint body\n');
    expect(out).toContain(':::tip[Hint]');
  });

  it('renders > [!success] as :::tip aside', async () => {
    const out = await transformCallout('> [!success]\n> great\n');
    expect(out).toContain(':::tip[Success]');
  });

  it('renders > [!failure] as :::caution aside', async () => {
    const out = await transformCallout('> [!failure]\n> not good\n');
    expect(out).toContain(':::caution[Failure]');
  });
});

// ---------------------------------------------------------------------------
// 3. Custom callout titles
// ---------------------------------------------------------------------------

describe('Custom callout titles', () => {
  async function transformCallout(md: string): Promise<string> {
    const engine = createSyntaxEngine(createObsidianHandlers({ callouts: true }));
    const r = await engine.transform({ path: 'test.md', content: md, format: 'md' });
    return r.content;
  }

  it('preserves a custom title provided after the type', async () => {
    const out = await transformCallout('> [!warning] Watch out!\n> body\n');
    expect(out).toContain(':::caution[Watch out!]');
  });

  it('uses default title (capitalised type) when no custom title is given', async () => {
    const out = await transformCallout('> [!tip]\n> body\n');
    expect(out).toContain(':::tip[Tip]');
  });
});

// ---------------------------------------------------------------------------
// 4. Callout body Markdown
// ---------------------------------------------------------------------------

describe('Callout body Markdown', () => {
  it('preserves Markdown formatting inside the body', async () => {
    const engine = createSyntaxEngine(createObsidianHandlers({ callouts: true }));
    const md = '> [!note]\n> **bold** and _italic_\n> - list item\n';
    const result = await engine.transform({ path: 'test.md', content: md, format: 'md' });
    expect(result.content).toContain('**bold** and _italic_');
    expect(result.content).toContain('- list item');
  });

  it('does not strip non-callout blockquotes', async () => {
    const engine = createSyntaxEngine(createObsidianHandlers({ callouts: true }));
    const md = '> This is a normal blockquote\n';
    const result = await engine.transform({ path: 'test.md', content: md, format: 'md' });
    // Should pass through unchanged — not a callout
    expect(result.content).toContain('> This is a normal blockquote');
  });
});

// ---------------------------------------------------------------------------
// 5. Nested callouts
// ---------------------------------------------------------------------------

describe('Nested callouts', () => {
  it('normalises inner nested callout without corrupting outer callout or surrounding text', async () => {
    const engine = createSyntaxEngine(createObsidianHandlers({ callouts: true }));
    const md = [
      '> [!note] Outer',
      '> body of outer',
      '>> [!warning] Inner',
      '>> body of inner',
      '',
      'Normal paragraph after.',
    ].join('\n');
    const result = await engine.transform({ path: 'test.md', content: md, format: 'md' });
    const out = result.content;
    // Outer callout present
    expect(out).toContain(':::note[Outer]');
    // Inner callout present
    expect(out).toContain(':::caution[Inner]');
    // Surrounding paragraph preserved
    expect(out).toContain('Normal paragraph after.');
    // No raw `[!` markers remain in the prose section
    expect(out).not.toMatch(/^> \[!/m);
  });
});

// ---------------------------------------------------------------------------
// 6. Foldable callouts
// ---------------------------------------------------------------------------

describe('Foldable callouts', () => {
  async function transform(md: string): Promise<string> {
    const engine = createSyntaxEngine(createObsidianHandlers({ callouts: true }));
    const r = await engine.transform({ path: 'test.md', content: md, format: 'md' });
    return r.content;
  }

  it('renders a + foldable callout as <details open>', async () => {
    const out = await transform('> [!tip]+ Open by default\n> tip body\n');
    expect(out).toContain('<details open>');
    expect(out).toContain('<summary>Open by default</summary>');
    expect(out).toContain('tip body');
    expect(out).toContain('</details>');
  });

  it('renders a - foldable callout as <details> (closed)', async () => {
    const out = await transform('> [!warning]- Collapsed Warning\n> be careful\n');
    expect(out).toContain('<details>');
    expect(out).not.toContain('<details open>');
    expect(out).toContain('<summary>Collapsed Warning</summary>');
    expect(out).toContain('be careful');
  });

  it('uses type-derived title when no custom title given on foldable callout', async () => {
    const out = await transform('> [!note]+\n> body\n');
    expect(out).toContain('<summary>Note</summary>');
  });
});

// ---------------------------------------------------------------------------
// 7. Unknown callout types
// ---------------------------------------------------------------------------

describe('Unknown callout types', () => {
  it('renders unknown types as :::note with a warning diagnostic', async () => {
    const engine = createSyntaxEngine(createObsidianHandlers({ callouts: true }));
    const result = await engine.transform({
      path: 'test.md',
      content: '> [!custom-type]\n> body\n',
      format: 'md',
    });
    expect(result.content).toContain(':::note[Custom-type]');
    const unknownDiag = result.diagnostics.find((d) => d.code === 'UNKNOWN_CALLOUT_TYPE');
    expect(unknownDiag).toBeDefined();
    expect(unknownDiag?.severity).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// 8. MDX-adjacent content — callout normalization must not break MDX
// ---------------------------------------------------------------------------

describe('MDX-adjacent content', () => {
  it('does not corrupt JSX component lines near callouts', async () => {
    const engine = createSyntaxEngine(createObsidianHandlers({ callouts: true }));
    const md = [
      'import { Card } from "@components/Card"',
      '',
      '> [!note]',
      '> note body',
      '',
      '<Card title="Hello">content</Card>',
    ].join('\n');
    const result = await engine.transform({ path: 'page.mdx', content: md, format: 'mdx' });
    expect(result.content).toContain('import { Card } from "@components/Card"');
    expect(result.content).toContain('<Card title="Hello">content</Card>');
    expect(result.content).toContain(':::note[Note]');
  });

  it('does not transform callout-like text inside a fenced code block', async () => {
    const engine = createSyntaxEngine(createObsidianHandlers({ callouts: true }));
    const md = '```\n> [!note]\n> body\n```\n';
    const result = await engine.transform({ path: 'test.md', content: md, format: 'md' });
    // The content inside the fenced code block should be unchanged
    expect(result.content).toContain('> [!note]');
    expect(result.content).not.toContain(':::note');
  });
});

// ---------------------------------------------------------------------------
// 9. End-to-end: callouts through normalizeVault
// ---------------------------------------------------------------------------

describe('End-to-end callout normalization through normalizeVault', () => {
  it('normalises callouts in target-public pages', async () => {
    writeFile(
      sourceRoot,
      'guide.md',
      [
        '---',
        'title: Guide',
        'publish: engineering',
        '---',
        '',
        '> [!warning] Caution',
        '> Be careful here.',
        '',
        'Normal text after.',
      ].join('\n'),
    );

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const outputContent = readText(path.join(outputRoot, 'guide.md'));
    expect(outputContent).toContain(':::caution[Caution]');
    expect(outputContent).toContain('Be careful here.');
    expect(outputContent).toContain('Normal text after.');
  });

  it('preserves non-callout blockquotes in target-public pages', async () => {
    writeFile(
      sourceRoot,
      'page.md',
      [
        '---',
        'title: Page',
        'publish: engineering',
        '---',
        '',
        '> This is a regular blockquote.',
        '',
        '> [!tip]',
        '> Use this tip.',
      ].join('\n'),
    );

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const outputContent = readText(path.join(outputRoot, 'page.md'));
    expect(outputContent).toContain('> This is a regular blockquote.');
    expect(outputContent).toContain(':::tip[Tip]');
  });

  it('emits UNKNOWN_CALLOUT_TYPE warning in diagnostics for unknown callout types', async () => {
    writeFile(
      sourceRoot,
      'page.md',
      [
        '---',
        'title: Page',
        'publish: engineering',
        '---',
        '',
        '> [!mycustomtype]',
        '> body',
      ].join('\n'),
    );

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));
    const diags = result.diagnostics.diagnostics;
    expect(diags.some((d) => d.code === 'UNKNOWN_CALLOUT_TYPE')).toBe(true);
  });

  it('does not normalise callouts in non-public pages', async () => {
    writeFile(
      sourceRoot,
      'private.md',
      [
        '---',
        'title: Private',
        '---',
        '',
        '> [!warning]',
        '> secret',
      ].join('\n'),
    );

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    // Private page should not be emitted to output at all
    const privateOut = path.join(outputRoot, 'private.md');
    expect(fs.existsSync(privateOut)).toBe(false);
  });

  it('normalises callouts correctly alongside wikilinks in the same page', async () => {
    writeFile(
      sourceRoot,
      'other.md',
      '---\ntitle: Other Page\npublish: engineering\n---\ncontent\n',
    );
    writeFile(
      sourceRoot,
      'combined.md',
      [
        '---',
        'title: Combined',
        'publish: engineering',
        '---',
        '',
        'See [[Other Page]] for details.',
        '',
        '> [!note]',
        '> Note body.',
      ].join('\n'),
    );

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const out = readText(path.join(outputRoot, 'combined.md'));
    // Wikilink resolved
    expect(out).toContain('[Other Page](/other/)');
    // Callout normalised
    expect(out).toContain(':::note[Note]');
  });
});
