/**
 * Phase 13: Performance, Accessibility, and Release Readiness
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeVault } from '@fea-docs/normalizer';
import { artifactFileNames, type FeaDocsGraph, type FeaDocsManifest } from '@fea-docs/schema';
import { ContentGraphEngine } from '../content-graph/engine.js';
import type { ResolvedConfig } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-phase13-test-'));
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
    name: undefined,
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
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('normalization performance shape', () => {
  it('normalizes a representative linked vault with bounded indexed lookups', async () => {
    const pageCount = 160;
    for (let i = 0; i < pageCount; i++) {
      const next = (i + 1) % pageCount;
      writeFile(
        sourceRoot,
        `notes/page-${i}.md`,
        `---\ntitle: Page ${i}\npublish: engineering\naliases: [Alias ${i}]\n---\nSee [[Page ${next}]], [[Alias ${next}]], and [[notes/page-${next}]].\n`,
      );
    }

    const started = performance.now();
    await normalizeVault({
      sourceRoot,
      outputRoot,
      targetId: 'engineering',
      configuredTargets: ['engineering'],
      strict: true,
    });
    const elapsedMs = performance.now() - started;

    const graph = readJson<FeaDocsGraph>(path.join(outputRoot, artifactFileNames.graph));
    const diagnostics = readJson<{ diagnostics: Array<{ severity: string }> }>(path.join(outputRoot, artifactFileNames.diagnostics));
    expect(graph.nodes).toHaveLength(pageCount);
    expect(graph.edges).toHaveLength(pageCount * 3);
    expect(diagnostics.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(elapsedMs).toBeLessThan(5000);
  });
});

describe('incremental graph discovery cache', () => {
  it('reuses cached graph data when docs are unchanged', async () => {
    writeFile(sourceRoot, 'index.md', '---\ntitle: Home\n---\n# Home\n');
    const engine = new ContentGraphEngine(baseConfig(sourceRoot));

    const first = await engine.scan();
    const parseSpy = vi.spyOn(fs, 'readFileSync');
    const second = await engine.scan();

    expect(second).toEqual(first);
    expect(parseSpy).not.toHaveBeenCalledWith(path.join(sourceRoot, 'index.md'), 'utf-8');
  });
});

describe('final POC artifacts', () => {
  it('strict-normalizes the repository POC targets into destination-ready artifacts', async () => {
    const exampleRoot = path.resolve(__dirname, '../../../../example/docs');
    const tmpOutputRoot = path.join(tmpDir, 'poc-out');

    for (const targetId of ['engineering', 'recipes']) {
      const targetOutput = path.join(tmpOutputRoot, targetId);
      await normalizeVault({
        sourceRoot: exampleRoot,
        outputRoot: targetOutput,
        targetId,
        configuredTargets: ['engineering', 'recipes'],
        publicAssetDirs: ['assets'],
        strict: true,
      });

      const manifest = readJson<FeaDocsManifest>(path.join(targetOutput, artifactFileNames.manifest));
      const graph = readJson<FeaDocsGraph>(path.join(targetOutput, artifactFileNames.graph));
      const diagnostics = readJson<{ diagnostics: Array<{ severity: string }> }>(path.join(targetOutput, artifactFileNames.diagnostics));

      expect(manifest.targetId).toBe(targetId);
      expect(manifest.pages.length).toBeGreaterThan(0);
      expect(manifest.generatedDataFiles).toEqual(expect.arrayContaining([
        artifactFileNames.diagnostics,
        artifactFileNames.graph,
        artifactFileNames.backlinks,
        artifactFileNames.search,
      ]));
      expect(graph.targetId).toBe(targetId);
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(diagnostics.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
      expect(fs.existsSync(path.join(targetOutput, artifactFileNames.search))).toBe(true);
    }
  });
});
