/**
 * Phase 3 tests: Route Resolver and Wikilinks
 *
 * Covers all Phase 3 acceptance criteria:
 * - [[Note]] resolves to correct public page route
 * - [[Note|Alias]] uses alias link text
 * - [[Note#Heading]] resolves heading anchor
 * - [[Note#Heading|Alias]] resolves heading anchor with alias text
 * - [[Note#^block-id]] resolves block anchor
 * - Resolution by path, title, and global frontmatter aliases
 * - Pipe aliases are display text only, not global alias definitions
 * - Ambiguous targets produce diagnostics
 * - Wikilinks inside fenced code, inline code, and MDX import/export are untouched
 * - Development mode warns on unresolved/ambiguous wikilinks
 * - Strict mode fails on unresolved/ambiguous wikilinks
 * - Graph edges populated from resolved wikilinks
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-phase3-test-'));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
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
// 1. Basic wikilink resolution
// ---------------------------------------------------------------------------

describe('Basic wikilink resolution', () => {
  it('resolves [[Note]] to the correct public page route', async () => {
    writeFile(sourceRoot, 'target.md', '---\ntitle: Target Page\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[Target Page]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'source.md'));
    expect(content).toContain('[Target Page](/target/)');
    expect(content).not.toContain('[[Target Page]]');
  });

  it('resolves [[Note]] by source path basename', async () => {
    writeFile(sourceRoot, 'sub/page.md', '---\ntitle: Sub Page\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'index.md', '---\ntitle: Home\npublish: engineering\n---\nSee [[page]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'index.md'));
    expect(content).toContain('[Sub Page](/sub/page/)');
  });

  it('resolves [[Note]] by full path (without extension)', async () => {
    writeFile(sourceRoot, 'sub/page.md', '---\ntitle: Sub Page\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'index.md', '---\ntitle: Home\npublish: engineering\n---\nSee [[sub/page]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'index.md'));
    expect(content).toContain('[Sub Page](/sub/page/)');
  });

  it('resolves [[Note]] by page title', async () => {
    writeFile(sourceRoot, 'path/to/note.md', '---\ntitle: My Special Note\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'index.md', '---\ntitle: Home\npublish: engineering\n---\nSee [[My Special Note]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'index.md'));
    expect(content).toContain('[My Special Note](/path/to/note/)');
  });
});

// ---------------------------------------------------------------------------
// 2. Alias syntax
// ---------------------------------------------------------------------------

describe('Alias syntax [[Note|Alias]]', () => {
  it('renders alias as link text', async () => {
    writeFile(sourceRoot, 'target.md', '---\ntitle: Architecture\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[Architecture|our arch]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'source.md'));
    expect(content).toContain('[our arch](/target/)');
    expect(content).not.toContain('[[Architecture|our arch]]');
  });

  it('pipe alias is not treated as a global alias', async () => {
    // The pipe alias 'our arch' should not resolve as a link target in another note.
    writeFile(sourceRoot, 'target.md', '---\ntitle: Architecture\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[Architecture|our arch]].\n');
    writeFile(sourceRoot, 'other.md', '---\ntitle: Other\npublish: engineering\n---\nSee [[our arch]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    // [[our arch]] in other.md should be unresolved — it's a per-link display text, not a global alias
    const warnings = result.diagnostics.diagnostics.filter((d) => d.code === 'UNRESOLVED_WIKILINK');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.sourcePath === 'other.md')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Heading and block fragment resolution
// ---------------------------------------------------------------------------

describe('Heading fragment resolution [[Note#Heading]]', () => {
  it('resolves [[Note#Heading]] to heading anchor', async () => {
    writeFile(
      sourceRoot,
      'target.md',
      '---\ntitle: Target\npublish: engineering\n---\n# Target\n\n## My Section\n\nContent here.\n',
    );
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[Target#My Section]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'source.md'));
    expect(content).toContain('/target/#my-section');
  });

  it('resolves [[Note#Heading|Alias]] with alias text and heading anchor', async () => {
    writeFile(
      sourceRoot,
      'target.md',
      '---\ntitle: Target\npublish: engineering\n---\n# Target\n\n## My Section\n\nContent.\n',
    );
    writeFile(
      sourceRoot,
      'source.md',
      '---\ntitle: Source\npublish: engineering\n---\nSee [[Target#My Section|this section]].\n',
    );

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'source.md'));
    expect(content).toContain('[this section](/target/#my-section)');
  });

  it('resolves [[Note#^block-id]] to block anchor', async () => {
    writeFile(
      sourceRoot,
      'target.md',
      '---\ntitle: Target\npublish: engineering\n---\nThis is a paragraph. ^my-block\n',
    );
    writeFile(
      sourceRoot,
      'source.md',
      '---\ntitle: Source\npublish: engineering\n---\nSee [[Target#^my-block]].\n',
    );

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'source.md'));
    expect(content).toContain('/target/#my-block');
    expect(content).not.toContain('[[Target#^my-block]]');
  });
});

// ---------------------------------------------------------------------------
// 4. Global frontmatter alias resolution
// ---------------------------------------------------------------------------

describe('Global frontmatter alias resolution', () => {
  it('resolves wikilinks by frontmatter aliases', async () => {
    writeFile(
      sourceRoot,
      'target.md',
      '---\ntitle: Architecture\npublish: engineering\naliases: [Arch, System Design]\n---\nContent\n',
    );
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[Arch]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'source.md'));
    expect(content).toContain('[Architecture](/target/)');
    expect(content).not.toContain('[[Arch]]');
  });

  it('resolves by single string alias in frontmatter', async () => {
    writeFile(
      sourceRoot,
      'target.md',
      '---\ntitle: Overview\npublish: engineering\naliases: Intro\n---\nContent\n',
    );
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[Intro]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'source.md'));
    expect(content).toContain('[Overview](/target/)');
  });
});

// ---------------------------------------------------------------------------
// 5. Ambiguous wikilinks
// ---------------------------------------------------------------------------

describe('Ambiguous wikilinks', () => {
  it('produces AMBIGUOUS_WIKILINK warning when multiple pages match by basename', async () => {
    writeFile(sourceRoot, 'a/note.md', '---\ntitle: Note A\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'b/note.md', '---\ntitle: Note B\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[note]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const ambiguous = result.diagnostics.diagnostics.filter((d) => d.code === 'AMBIGUOUS_WIKILINK');
    expect(ambiguous.length).toBeGreaterThan(0);
  });

  it('leaves ambiguous wikilinks as-is in the output', async () => {
    writeFile(sourceRoot, 'a/note.md', '---\ntitle: Note A\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'b/note.md', '---\ntitle: Note B\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[note]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'source.md'));
    expect(content).toContain('[[note]]');
  });

  it('fails strict build on ambiguous wikilinks', async () => {
    writeFile(sourceRoot, 'a/note.md', '---\ntitle: Note A\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'b/note.md', '---\ntitle: Note B\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[note]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await expect(
      normalizeVault({ ...baseOptions(sourceRoot, outputRoot), strict: true }),
    ).rejects.toThrow('strict diagnostics');
  });
});

// ---------------------------------------------------------------------------
// 6. Unresolved wikilinks
// ---------------------------------------------------------------------------

describe('Unresolved wikilinks', () => {
  it('produces UNRESOLVED_WIKILINK warning in development mode', async () => {
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[NonExistent]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault({ ...baseOptions(sourceRoot, outputRoot), mode: 'development' });

    const unresolved = result.diagnostics.diagnostics.filter((d) => d.code === 'UNRESOLVED_WIKILINK');
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved[0].severity).toBe('warning');
  });

  it('fails strict build on unresolved wikilinks', async () => {
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[NonExistent]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await expect(
      normalizeVault({ ...baseOptions(sourceRoot, outputRoot), strict: true }),
    ).rejects.toThrow('strict diagnostics');
  });

  it('leaves unresolved wikilinks as-is in the output', async () => {
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[NonExistent]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'source.md'));
    expect(content).toContain('[[NonExistent]]');
  });

  it('wikilink to a non-target page is unresolved (not in target)', async () => {
    writeFile(sourceRoot, 'other.md', '---\ntitle: Other\npublish: recipes\n---\nContent\n');
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[Other]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    // 'Other' is public for 'recipes' but not 'engineering', so Phase 4 classifies
    // this as a cross-target link rather than a generic unresolved wikilink.
    const crossTarget = result.diagnostics.diagnostics.filter((d) => d.code === 'CROSS_TARGET_PAGE_LINK');
    expect(crossTarget.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 7. MDX safety — wikilinks in protected regions are not corrupted
// ---------------------------------------------------------------------------

describe('MDX safety', () => {
  it('does not transform wikilinks inside fenced code blocks', async () => {
    writeFile(sourceRoot, 'target.md', '---\ntitle: Target\npublish: engineering\n---\nContent\n');
    writeFile(
      sourceRoot,
      'source.md',
      '---\ntitle: Source\npublish: engineering\n---\n```\n[[Target]]\n```\nReal [[Target]] outside.\n',
    );

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'source.md'));
    // Inside code block — must remain as wikilink syntax.
    expect(content).toContain('[[Target]]\n```');
    // Outside code block — must be resolved.
    expect(content).toContain('[Target](/target/)');
  });

  it('does not transform wikilinks inside inline code', async () => {
    writeFile(sourceRoot, 'target.md', '---\ntitle: Target\npublish: engineering\n---\nContent\n');
    writeFile(
      sourceRoot,
      'source.md',
      '---\ntitle: Source\npublish: engineering\n---\nUse `` `[[Target]]` `` for inline code. Real [[Target]].\n',
    );

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'source.md'));
    // Inside inline code — must remain as wikilink syntax.
    expect(content).toContain('`[[Target]]`');
    // Outside inline code — must be resolved.
    expect(content).toContain('[Target](/target/)');
  });

  it('does not transform wikilinks on MDX import lines', async () => {
    writeFile(sourceRoot, 'target.md', '---\ntitle: Target\npublish: engineering\n---\nContent\n');
    writeFile(
      sourceRoot,
      'source.mdx',
      '---\ntitle: Source\npublish: engineering\n---\nimport Something from "[[Target]]";\n\nReal [[Target]] outside.\n',
    );

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'source.mdx'));
    // On import line — must remain as-is (import lines are not modified).
    expect(content).toContain('import Something from "[[Target]]"');
    // Outside import — must be resolved.
    expect(content).toContain('[Target](/target/)');
  });

  it('does not transform wikilinks on MDX export lines', async () => {
    writeFile(sourceRoot, 'target.md', '---\ntitle: Target\npublish: engineering\n---\nContent\n');
    writeFile(
      sourceRoot,
      'source.mdx',
      '---\ntitle: Source\npublish: engineering\n---\nexport const note = "[[Target]]";\n\nNormal [[Target]].\n',
    );

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const content = readText(path.join(outputRoot, 'source.mdx'));
    expect(content).toContain('export const note = "[[Target]]"');
    expect(content).toContain('[Target](/target/)');
  });

  it('does not produce UNRESOLVED_WIKILINK diagnostics for wikilinks in fenced code blocks', async () => {
    writeFile(
      sourceRoot,
      'source.md',
      '---\ntitle: Source\npublish: engineering\n---\n```\n[[DoesNotExist]]\n```\n',
    );

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const unresolved = result.diagnostics.diagnostics.filter((d) => d.code === 'UNRESOLVED_WIKILINK');
    expect(unresolved).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Graph edges from wikilinks
// ---------------------------------------------------------------------------

describe('Graph edges from resolved wikilinks', () => {
  it('emits a wikilink edge from source to target page', async () => {
    writeFile(sourceRoot, 'target.md', '---\ntitle: Target\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[Target]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const graph = readJson(path.join(outputRoot, 'fea-docs.graph.json')) as {
      edges: Array<{ source: string; target: string; type: string }>;
    };

    const wikilinkEdge = graph.edges.find(
      (e) => e.source === '/source' && e.target === '/target' && e.type === 'wikilink',
    );
    expect(wikilinkEdge).toBeDefined();
  });

  it('emits multiple edges for multiple wikilinks on the same page', async () => {
    writeFile(sourceRoot, 'a.md', '---\ntitle: A\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'b.md', '---\ntitle: B\npublish: engineering\n---\nContent\n');
    writeFile(
      sourceRoot,
      'source.md',
      '---\ntitle: Source\npublish: engineering\n---\nSee [[A]] and [[B]].\n',
    );

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const graph = readJson(path.join(outputRoot, 'fea-docs.graph.json')) as {
      edges: Array<{ source: string; target: string; type: string }>;
    };

    expect(graph.edges.some((e) => e.source === '/source' && e.target === '/a')).toBe(true);
    expect(graph.edges.some((e) => e.source === '/source' && e.target === '/b')).toBe(true);
  });

  it('does not emit edges for unresolved wikilinks', async () => {
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[DoesNotExist]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const graph = readJson(path.join(outputRoot, 'fea-docs.graph.json')) as { edges: unknown[] };
    expect(graph.edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Diagnostic metadata
// ---------------------------------------------------------------------------

describe('Diagnostic metadata', () => {
  it('UNRESOLVED_WIKILINK diagnostic includes sourcePath and suggestion', async () => {
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[Ghost]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault({ ...baseOptions(sourceRoot, outputRoot), mode: 'development' });

    const d = result.diagnostics.diagnostics.find((x) => x.code === 'UNRESOLVED_WIKILINK');
    expect(d).toBeDefined();
    expect(d!.sourcePath).toBe('source.md');
    expect(d!.suggestion).toBeTruthy();
  });

  it('AMBIGUOUS_WIKILINK diagnostic includes sourcePath and lists matches', async () => {
    writeFile(sourceRoot, 'a/note.md', '---\ntitle: Note A\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'b/note.md', '---\ntitle: Note B\npublish: engineering\n---\nContent\n');
    writeFile(sourceRoot, 'source.md', '---\ntitle: Source\npublish: engineering\n---\nSee [[note]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault(baseOptions(sourceRoot, outputRoot));

    const d = result.diagnostics.diagnostics.find((x) => x.code === 'AMBIGUOUS_WIKILINK');
    expect(d).toBeDefined();
    expect(d!.sourcePath).toBe('source.md');
    expect(d!.message).toContain('a/note.md');
    expect(d!.message).toContain('b/note.md');
  });
});
