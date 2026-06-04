/**
 * Phase 12: Strict CI, Diagnostics, and Build Hardening
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeVault } from '@fea-docs/normalizer';
import { artifactSchemas, isFeaDocsDiagnosticsFile, type FeaDocsDiagnosticsFile } from '@fea-docs/schema';
import { publishTarget } from '../cli/commands/publish.js';
import type { ResolvedConfig } from '../types.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-phase12-test-'));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function baseConfig(root: string): ResolvedConfig {
  return {
    name: 'Phase 12',
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
      strict: true,
      targets: {
        engineering: {},
        recipes: {},
      },
    },
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

describe('diagnostics artifact quality', () => {
  it('emits machine-readable diagnostics with code, severity, source, location, and suggestion', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\nSee [[Missing]].\n');

    const outputRoot = path.join(tmpDir, 'out');
    const result = await normalizeVault({
      sourceRoot,
      outputRoot,
      targetId: 'engineering',
      configuredTargets: ['engineering', 'recipes'],
      strict: false,
      mode: 'development',
    });

    const diagnostic = result.diagnostics.diagnostics.find((d) => d.code === 'UNRESOLVED_WIKILINK');
    expect(diagnostic).toMatchObject({
      severity: 'warning',
      sourcePath: 'page.md',
      location: { line: 5 },
    });
    expect(diagnostic?.suggestion).toContain('target page exists');

    const file = readJson<FeaDocsDiagnosticsFile>(path.join(outputRoot, 'fea-docs.diagnostics.json'));
    expect(isFeaDocsDiagnosticsFile(file)).toBe(true);
    expect(file.diagnostics.some((d) => d.code === 'UNRESOLVED_WIKILINK')).toBe(true);
  });

  it('exports schemas for CI-readable artifacts', () => {
    expect(Object.keys(artifactSchemas).sort()).toEqual([
      'backlinks',
      'diagnostics',
      'graph',
      'manifest',
      'publish',
      'search',
    ]);
    expect(artifactSchemas.diagnostics.required).toContain('diagnostics');
    expect(artifactSchemas.publish.required).toContain('status');
  });
});

describe('strict cleanup hardening', () => {
  it('removes normalized page and asset artifacts after a strict failure', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\n![[Missing Note]]\n');
    writeFile(sourceRoot, 'secret.md', '---\ntitle: Secret\npublish: engineering\n---\nSecret content.\n');

    const outputRoot = path.join(tmpDir, 'out');
    await expect(normalizeVault({
      sourceRoot,
      outputRoot,
      targetId: 'engineering',
      configuredTargets: ['engineering', 'recipes'],
      strict: true,
    })).rejects.toThrow('strict diagnostics');

    expect(fs.existsSync(path.join(outputRoot, 'page.md'))).toBe(false);
    expect(fs.existsSync(path.join(outputRoot, 'secret.md'))).toBe(false);
    const diagnosticsPath = path.join(outputRoot, 'fea-docs.diagnostics.json');
    expect(fs.existsSync(diagnosticsPath)).toBe(true);
    const file = readJson<FeaDocsDiagnosticsFile>(diagnosticsPath);
    expect(file.diagnostics.some((d) => d.code === 'UNRESOLVED_EMBED' && d.severity === 'error')).toBe(true);
  });

  it('writes a failed publish summary and removes normalized output on publish failure', async () => {
    writeFile(sourceRoot, 'page.md', '---\ntitle: Page\npublish: engineering\n---\nContent.\n');

    await expect(
      publishTarget(baseConfig(sourceRoot), 'engineering', ['engineering', 'recipes'], undefined, true),
    ).rejects.toThrow('no normalizedDocs or staticOutput destination configured');

    expect(fs.existsSync(path.join(tmpDir, '.fea-docs', 'normalized', 'engineering'))).toBe(false);
    const publishSummary = readJson<{ status: string; diagnostics: Array<{ code: string }> }>(
      path.join(tmpDir, '.fea-docs', 'publish', 'engineering', 'fea-docs.publish.json'),
    );
    expect(publishSummary.status).toBe('failed');
    expect(publishSummary.diagnostics[0].code).toBe('PUBLISH_ERROR');
  });
});
