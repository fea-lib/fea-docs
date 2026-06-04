/**
 * Phase 11: Target Publishing Workflow
 *
 * Tests cover:
 *  - GitPublisher: same-repo destinations, separate-repo destinations
 *  - publish-all sequencing
 *  - per-target failure summaries
 *  - missing destination config in strict mode
 *  - private/cross-target artifact prevention (normalized output is already clean)
 *  - fea-docs.publish.json shape
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { GitPublisher, resolveGitRoot } from '../publisher/git-publisher.js';
import { publishTarget } from '../cli/commands/publish.js';
import { artifactFileNames } from '@fea-docs/schema';
import type { ResolvedConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fea-docs-${prefix}-`));
}

/** Initialise a bare-ish local git repo with an initial commit. */
function initGitRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@fea-docs.local']);
  git(dir, ['config', 'user.name', 'Test']);
  // Need at least one commit so HEAD exists
  const readme = path.join(dir, 'README.md');
  fs.writeFileSync(readme, '# initial\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-m', 'init']);
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function writeFile(root: string, rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/** Create a minimal source vault with one engineering-public page. */
function makeVault(root: string): void {
  writeFile(root, 'index.md', '---\ntitle: Home\npublish: engineering\n---\n# Home\n');
  writeFile(root, 'private.md', '---\ntitle: Private\n---\n# Private\n');
}

/** Build a minimal ResolvedConfig for tests. */
function makeConfig(
  root: string,
  targets: ResolvedConfig['obsidian']['targets'] = {},
): ResolvedConfig {
  return {
    name: 'Test',
    title: undefined,
    root,
    base: '/',
    ignore: [],
    port: 4321,
    open: false,
    strict: false,
    frameworks: [],
    aliases: {},
    tailscaleServe: false,
    caffeinate: false,
    expose: false,
    obsidian: {
      enabled: true,
      features: {
        wikilinks: false,
        embeds: false,
        callouts: false,
        backlinks: false,
        graph: false,
        targetAllowlisting: true,
      },
      targets,
    },
  };
}

// ---------------------------------------------------------------------------
// GitPublisher — same-repo destinations
// ---------------------------------------------------------------------------

describe('Phase 11: GitPublisher — same-repo destinations', () => {
  let repoDir: string;
  let srcDir: string;

  beforeEach(() => {
    repoDir = makeTmpDir('repo');
    srcDir = makeTmpDir('src');
    initGitRepo(repoDir);
    writeFile(srcDir, 'page.md', '# Hello\n');
    writeFile(srcDir, 'sub/nested.md', '# Nested\n');
  });

  afterEach(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(srcDir, { recursive: true, force: true });
  });

  it('creates a new branch and commits files for repo: "."', async () => {
    const publisher = new GitPublisher(repoDir);
    const result = await publisher.publishDir(srcDir, { repo: '.', branch: 'output/test', path: 'docs' });

    expect(result.skipped).toBe(false);
    expect(result.sha).toMatch(/^[0-9a-f]{40}$/);

    // Verify branch exists in the repo
    const branches = git(repoDir, ['branch', '-a']);
    expect(branches).toContain('output/test');

    // Verify the committed files
    const tmpCheck = makeTmpDir('verify');
    try {
      git(tmpCheck, ['clone', repoDir, '.']);
      git(tmpCheck, ['checkout', 'output/test']);
      expect(fs.existsSync(path.join(tmpCheck, 'docs', 'page.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpCheck, 'docs', 'sub', 'nested.md'))).toBe(true);
    } finally {
      fs.rmSync(tmpCheck, { recursive: true, force: true });
    }
  });

  it('pushes to an existing branch on a second publish', async () => {
    const publisher = new GitPublisher(repoDir);

    // First publish
    const r1 = await publisher.publishDir(srcDir, { repo: '.', branch: 'output/existing', path: 'docs' });
    expect(r1.skipped).toBe(false);

    // Second publish with updated content
    writeFile(srcDir, 'new-file.md', '# New\n');
    const r2 = await publisher.publishDir(srcDir, { repo: '.', branch: 'output/existing', path: 'docs' });
    expect(r2.skipped).toBe(false);
    expect(r2.sha).not.toBe(r1.sha);
  });

  it('skips when there is nothing to commit (identical tree)', async () => {
    const publisher = new GitPublisher(repoDir);
    const dest = { repo: '.', branch: 'output/idempotent', path: '.' };

    const r1 = await publisher.publishDir(srcDir, dest);
    expect(r1.skipped).toBe(false);

    const r2 = await publisher.publishDir(srcDir, dest);
    expect(r2.skipped).toBe(true);
    expect(r2.reason).toBe('nothing-to-commit');
  });

  it('returns skipped with reason "dry-run" when dryRun is true', async () => {
    const publisher = new GitPublisher(repoDir);
    const result = await publisher.publishDir(
      srcDir,
      { repo: '.', branch: 'output/dry', path: 'docs' },
      { dryRun: true },
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('dry-run');
  });

  it('throws when the source directory does not exist', async () => {
    const publisher = new GitPublisher(repoDir);
    await expect(
      publisher.publishDir('/nonexistent/path', { repo: '.', branch: 'x', path: '.' }),
    ).rejects.toThrow('Source directory does not exist');
  });
});

// ---------------------------------------------------------------------------
// GitPublisher — separate-repo destinations
// ---------------------------------------------------------------------------

describe('Phase 11: GitPublisher — separate-repo destinations', () => {
  let sourceRepo: string;
  let destRepo: string;
  let srcDir: string;

  beforeEach(() => {
    sourceRepo = makeTmpDir('src-repo');
    destRepo = makeTmpDir('dest-repo');
    srcDir = makeTmpDir('src');
    initGitRepo(sourceRepo);
    initGitRepo(destRepo);
    writeFile(srcDir, 'artifact.md', '# Artifact\n');
  });

  afterEach(() => {
    fs.rmSync(sourceRepo, { recursive: true, force: true });
    fs.rmSync(destRepo, { recursive: true, force: true });
    fs.rmSync(srcDir, { recursive: true, force: true });
  });

  it('pushes files to a separate repo at a configured path', async () => {
    const publisher = new GitPublisher(sourceRepo);
    const result = await publisher.publishDir(srcDir, {
      repo: destRepo,
      branch: 'gh-pages',
      path: 'output',
    });

    expect(result.skipped).toBe(false);
    expect(result.sha).toMatch(/^[0-9a-f]{40}$/);

    // Verify the destination repo has the branch + file
    const tmpCheck = makeTmpDir('verify');
    try {
      git(tmpCheck, ['clone', destRepo, '.']);
      git(tmpCheck, ['checkout', 'gh-pages']);
      expect(fs.existsSync(path.join(tmpCheck, 'output', 'artifact.md'))).toBe(true);
    } finally {
      fs.rmSync(tmpCheck, { recursive: true, force: true });
    }
  });

  it('normalizedDocs and staticOutput can go to different repos', async () => {
    const destRepo2 = makeTmpDir('dest-repo2');
    initGitRepo(destRepo2);

    try {
      const publisher = new GitPublisher(sourceRepo);

      const r1 = await publisher.publishDir(srcDir, { repo: destRepo, branch: 'normalized', path: 'docs' });
      const r2 = await publisher.publishDir(srcDir, { repo: destRepo2, branch: 'static', path: '.' });

      expect(r1.skipped).toBe(false);
      expect(r2.skipped).toBe(false);
      // Different repos → different SHAs not guaranteed but both must be valid
      expect(r1.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(r2.sha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      fs.rmSync(destRepo2, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// publishTarget — strict-mode destination config validation
// ---------------------------------------------------------------------------

describe('Phase 11: publishTarget — strict mode validation', () => {
  let vaultDir: string;

  beforeEach(() => {
    vaultDir = makeTmpDir('vault');
    makeVault(vaultDir);
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  it('throws for an unknown targetId', async () => {
    const config = makeConfig(vaultDir, { engineering: {} });
    await expect(
      publishTarget(config, 'unknown', ['engineering'], undefined, false),
    ).rejects.toThrow('Unknown target');
  });

  it('throws in strict mode when no destination is configured', async () => {
    const config = makeConfig(vaultDir, { engineering: {} }); // no normalizedDocs or staticOutput
    await expect(
      publishTarget(config, 'engineering', ['engineering'], undefined, true),
    ).rejects.toThrow('no normalizedDocs or staticOutput destination configured');
  });

  it('does not throw in non-strict mode when no destination is configured', async () => {
    const config = makeConfig(vaultDir, { engineering: {} });
    const summary = await publishTarget(config, 'engineering', ['engineering'], undefined, false);
    expect(summary.status).toBe('success');
    expect(summary.normalizedDocsRef).toBeUndefined();
    expect(summary.staticOutputRef).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// publishTarget — normalized docs publishing
// ---------------------------------------------------------------------------

describe('Phase 11: publishTarget — normalized docs publishing', () => {
  let vaultDir: string;
  let repoDir: string;

  beforeEach(() => {
    vaultDir = makeTmpDir('vault');
    repoDir = makeTmpDir('repo');
    makeVault(vaultDir);
    initGitRepo(repoDir);
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  it('publishes normalized docs to configured destination and writes fea-docs.publish.json', async () => {
    const config = makeConfig(vaultDir, {
      engineering: {
        normalizedDocs: { repo: repoDir, branch: 'norm-docs', path: 'docs' },
      },
    });

    const publisher = new GitPublisher(repoDir);
    const summary = await publishTarget(config, 'engineering', ['engineering'], publisher, false);

    expect(summary.status).toBe('success');
    expect(summary.normalizedDocsRef?.skipped).toBe(false);
    expect(summary.normalizedDocsRef?.sha).toMatch(/^[0-9a-f]{40}$/);

    // fea-docs.publish.json should be written next to the vault root
    const publishJson = path.join(
      path.dirname(vaultDir),
      '.fea-docs',
      'publish',
      'engineering',
      artifactFileNames.publish,
    );
    expect(fs.existsSync(publishJson)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(publishJson, 'utf8'));
    expect(parsed.targetId).toBe('engineering');
    expect(parsed.normalizedDocsRef.sha).toBeTruthy();
  });

  it('normalized output excludes private pages', async () => {
    const config = makeConfig(vaultDir, {
      engineering: {
        normalizedDocs: { repo: repoDir, branch: 'norm-docs-priv', path: 'docs' },
      },
    });

    const publisher = new GitPublisher(repoDir);
    await publishTarget(config, 'engineering', ['engineering'], publisher, false);

    // Inspect what was pushed
    const tmpCheck = makeTmpDir('verify');
    try {
      git(tmpCheck, ['clone', repoDir, '.']);
      git(tmpCheck, ['checkout', 'norm-docs-priv']);
      const files = fs.readdirSync(path.join(tmpCheck, 'docs'));
      // private.md has no publish: engineering → must NOT be in the output
      expect(files).not.toContain('private.md');
      // index.md has publish: engineering → MUST be present
      expect(files).toContain('index.md');
    } finally {
      fs.rmSync(tmpCheck, { recursive: true, force: true });
    }
  });

  it('skips git push when no publisher is provided (no-git-publisher)', async () => {
    const config = makeConfig(vaultDir, {
      engineering: {
        normalizedDocs: { repo: '.', branch: 'skip-branch', path: 'docs' },
      },
    });

    const summary = await publishTarget(config, 'engineering', ['engineering'], undefined, false);
    expect(summary.normalizedDocsRef?.skipped).toBe(true);
    expect(summary.normalizedDocsRef?.reason).toBe('no-git-publisher');
  });
});

// ---------------------------------------------------------------------------
// publishTarget — static output publishing
// ---------------------------------------------------------------------------

describe('Phase 11: publishTarget — static output publishing', () => {
  let vaultDir: string;
  let repoDir: string;
  let staticOutputDir: string;

  beforeEach(() => {
    vaultDir = makeTmpDir('vault');
    repoDir = makeTmpDir('repo');
    staticOutputDir = makeTmpDir('static');
    makeVault(vaultDir);
    initGitRepo(repoDir);
    // Simulate a static build output
    writeFile(staticOutputDir, 'index.html', '<html><body>Home</body></html>');
    writeFile(staticOutputDir, 'assets/style.css', 'body {}');
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(staticOutputDir, { recursive: true, force: true });
  });

  it('publishes pre-built static output when staticOutputDir is provided', async () => {
    const config = makeConfig(vaultDir, {
      engineering: {
        staticOutput: { repo: repoDir, branch: 'gh-pages', path: '.' },
      },
    });

    const publisher = new GitPublisher(repoDir);
    const summary = await publishTarget(
      config,
      'engineering',
      ['engineering'],
      publisher,
      false,
      staticOutputDir,
    );

    expect(summary.staticOutputRef?.skipped).toBe(false);
    expect(summary.staticOutputRef?.sha).toMatch(/^[0-9a-f]{40}$/);

    // Verify files reached the destination
    const tmpCheck = makeTmpDir('verify');
    try {
      git(tmpCheck, ['clone', repoDir, '.']);
      git(tmpCheck, ['checkout', 'gh-pages']);
      expect(fs.existsSync(path.join(tmpCheck, 'index.html'))).toBe(true);
    } finally {
      fs.rmSync(tmpCheck, { recursive: true, force: true });
    }
  });

  it('reports skipped with reason "static-output-not-built" when no staticOutputDir is given', async () => {
    const config = makeConfig(vaultDir, {
      engineering: {
        staticOutput: { repo: '.', branch: 'gh-pages', path: '.' },
      },
    });

    const summary = await publishTarget(config, 'engineering', ['engineering'], undefined, false);
    expect(summary.staticOutputRef?.skipped).toBe(true);
    expect(summary.staticOutputRef?.reason).toBe('static-output-not-built');
  });

  it('normalized docs and static output can target different destinations', async () => {
    const destRepo2 = makeTmpDir('dest-repo2');
    initGitRepo(destRepo2);

    try {
      const config = makeConfig(vaultDir, {
        engineering: {
          normalizedDocs: { repo: repoDir, branch: 'norm', path: 'docs' },
          staticOutput: { repo: destRepo2, branch: 'static', path: '.' },
        },
      });

      const publisher = new GitPublisher(repoDir);
      const summary = await publishTarget(
        config,
        'engineering',
        ['engineering'],
        publisher,
        false,
        staticOutputDir,
      );

      expect(summary.normalizedDocsRef?.skipped).toBe(false);
      expect(summary.staticOutputRef?.skipped).toBe(false);
    } finally {
      fs.rmSync(destRepo2, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Publish-all sequencing
// ---------------------------------------------------------------------------

describe('Phase 11: publish-all sequencing', () => {
  let vaultDir: string;
  let repoDir: string;

  beforeEach(() => {
    vaultDir = makeTmpDir('vault');
    repoDir = makeTmpDir('repo');
    initGitRepo(repoDir);

    // Two-target vault
    writeFile(vaultDir, 'eng.md', '---\ntitle: Eng\npublish: engineering\n---\n# Eng\n');
    writeFile(vaultDir, 'rec.md', '---\ntitle: Rec\npublish: recipes\n---\n# Rec\n');
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  it('publishes each target sequentially and produces separate publish summaries', async () => {
    const config = makeConfig(vaultDir, {
      engineering: {
        normalizedDocs: { repo: repoDir, branch: 'norm-eng', path: 'docs' },
      },
      recipes: {
        normalizedDocs: { repo: repoDir, branch: 'norm-rec', path: 'docs' },
      },
    });

    const publisher = new GitPublisher(repoDir);

    for (const targetId of ['engineering', 'recipes']) {
      const summary = await publishTarget(
        config,
        targetId,
        ['engineering', 'recipes'],
        publisher,
        false,
      );
      expect(summary.status).toBe('success');
      expect(summary.targetId).toBe(targetId);
    }

    // Both branches should exist in the repo
    const branches = git(repoDir, ['branch', '-a']);
    expect(branches).toContain('norm-eng');
    expect(branches).toContain('norm-rec');
  });

  it('fea-docs.publish.json includes per-target destination refs', async () => {
    const config = makeConfig(vaultDir, {
      engineering: {
        normalizedDocs: { repo: repoDir, branch: 'norm-eng-2', path: 'docs' },
      },
    });

    const publisher = new GitPublisher(repoDir);
    await publishTarget(config, 'engineering', ['engineering', 'recipes'], publisher, false);

    const publishJson = path.join(
      path.dirname(vaultDir),
      '.fea-docs',
      'publish',
      'engineering',
      artifactFileNames.publish,
    );
    const parsed = JSON.parse(fs.readFileSync(publishJson, 'utf8'));
    expect(parsed.version).toBe(1);
    expect(parsed.targetId).toBe('engineering');
    expect(parsed.normalizedDocs.branch).toBe('norm-eng-2');
    expect(parsed.normalizedDocsRef.sha).toBeTruthy();
    expect(parsed.status).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// resolveGitRoot
// ---------------------------------------------------------------------------

describe('Phase 11: resolveGitRoot', () => {
  it('resolves the git root of the current repo', () => {
    const root = resolveGitRoot(process.cwd());
    expect(typeof root).toBe('string');
    expect(fs.existsSync(path.join(root, '.git'))).toBe(true);
  });

  it('throws when path is not inside a git repo', () => {
    expect(() => resolveGitRoot(os.tmpdir())).toThrow();
  });
});
