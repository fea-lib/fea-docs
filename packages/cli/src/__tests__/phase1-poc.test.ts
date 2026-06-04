import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeVault } from '@fea-docs/normalizer';
import { artifactFileNames } from '@fea-docs/schema';
import { auditVault } from '../cli/commands/audit.js';
import type { ResolvedConfig } from '../types.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-phase1-test-'));
}

function writeFile(root: string, relPath: string, content: string): void {
  const fullPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function makeConfig(root: string): ResolvedConfig {
  return {
    name: 'POC',
    title: undefined,
    root,
    base: '/',
    ignore: [],
    port: 4321,
    open: false,
    strict: false,
    frameworks: ['react'],
    aliases: { '@react-lib': path.join(path.dirname(root), 'react-lib') },
    tailscaleServe: false,
    caffeinate: false,
    expose: false,
    obsidian: {
      enabled: true,
      targets: {
        engineering: {
          normalizedDocs: { repo: '.', branch: 'generated/engineering-docs', path: 'docs' },
          staticOutput: { repo: '.', branch: 'generated/engineering-site', path: '.' },
        },
        recipes: {
          normalizedDocs: { repo: '.', branch: 'generated/recipes-docs', path: 'docs' },
          staticOutput: { repo: '.', branch: 'generated/recipes-site', path: '.' },
        },
      },
    },
  };
}

function writePocVault(root: string): void {
  writeFile(root, 'index.md', "---\ntitle: Home\npublish: [engineering, recipes]\n---\n# Home\n[[Architecture]]\n");
  writeFile(root, 'engineering/architecture.md', "---\ntitle: Architecture\npublish: engineering\nbacklinks: true\npagefind: false\n---\n# Architecture\n> [!info]\n> Body\n![[diagram.svg]]\nBlock. ^block-id\n");
  writeFile(root, 'recipes/sourdough.md', "---\ntitle: Sourdough\npublish: recipes\n---\n# Sourdough\n[[Home]]\n");
  writeFile(root, 'private/secret.md', "---\ntitle: Secret\npublish: false\n---\n# Secret\n");
  writeFile(root, 'drafts/future.md', "---\ntitle: Future\npublish: engineering\ndraft: true\n---\n# Future\n");
  writeFile(root, 'integrations.mdx', "---\ntitle: Integrations\npublish: engineering\n---\nimport Counter from '@react-lib/Counter.tsx';\n\n<Counter client:load />\n");
  writeFile(root, 'diagram.svg', '<svg xmlns="http://www.w3.org/2000/svg" />\n');
}

describe('Phase 1 POC baseline', () => {
  let tmpDir: string;
  let docsRoot: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    docsRoot = path.join(tmpDir, 'docs');
    writePocVault(docsRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('audits POC vault coverage', async () => {
    const checks = await auditVault(makeConfig(docsRoot));

    expect(checks.every((check) => check.covered)).toBe(true);
  });

  it('normalizes one target with target filtering and manifest output', async () => {
    const outputRoot = path.join(tmpDir, 'normalized-engineering');
    const result = await normalizeVault({
      sourceRoot: docsRoot,
      outputRoot,
      targetId: 'engineering',
      configuredTargets: ['engineering', 'recipes'],
      strict: true,
    });

    const sourcePaths = result.manifest.pages.map((page) => page.sourcePath);
    expect(sourcePaths).toContain('engineering/architecture.md');
    expect(sourcePaths).toContain('integrations.mdx');
    expect(sourcePaths).toContain('index.md');
    expect(sourcePaths).not.toContain('recipes/sourdough.md');
    expect(sourcePaths).not.toContain('private/secret.md');
    expect(sourcePaths).not.toContain('drafts/future.md');
    expect(fs.existsSync(path.join(outputRoot, 'fea-docs.manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputRoot, 'integrations.mdx'))).toBe(true);
    expect(fs.existsSync(path.join(outputRoot, 'diagram.svg'))).toBe(true);
  });

  it('publish-all emits a summary JSON for every configured target', async () => {
    const config = makeConfig(docsRoot);
    const configuredTargets = Object.keys(config.obsidian!.targets!);

    for (const targetId of configuredTargets) {
      const normalizedOutput = path.join(tmpDir, 'normalized', targetId);
      const normResult = await normalizeVault({
        sourceRoot: docsRoot,
        outputRoot: normalizedOutput,
        targetId,
        configuredTargets,
        strict: false,
      });

      const { FeaDocsPublishSummary: _t, ..._ } = { FeaDocsPublishSummary: null };
      const targetConfig = config.obsidian!.targets![targetId]!;
      const summary = {
        version: 1,
        targetId,
        generatedAt: new Date().toISOString(),
        normalizedDocs: targetConfig.normalizedDocs,
        staticOutput: targetConfig.staticOutput,
        status: 'success',
        diagnostics: normResult.diagnostics.diagnostics,
      };
      const outDir = path.join(tmpDir, '.fea-docs', 'publish', targetId);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, artifactFileNames.publish), `${JSON.stringify(summary, null, 2)}\n`);
    }

    for (const targetId of configuredTargets) {
      const summaryPath = path.join(tmpDir, '.fea-docs', 'publish', targetId, artifactFileNames.publish);
      expect(fs.existsSync(summaryPath)).toBe(true);
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      expect(summary.targetId).toBe(targetId);
      expect(summary.status).toBe('success');
      expect(summary.version).toBe(1);
    }
  });

  it('normalized tree preserves MDX import and JSX syntax', async () => {
    const outputRoot = path.join(tmpDir, 'normalized-mdx-check');
    await normalizeVault({
      sourceRoot: docsRoot,
      outputRoot,
      targetId: 'engineering',
      configuredTargets: ['engineering', 'recipes'],
      strict: false,
    });

    const mdxPath = path.join(outputRoot, 'integrations.mdx');
    expect(fs.existsSync(mdxPath)).toBe(true);
    const content = fs.readFileSync(mdxPath, 'utf8');
    expect(content).toContain("import Counter from '@react-lib/Counter.tsx'");
    expect(content).toContain('<Counter');
  });
});
