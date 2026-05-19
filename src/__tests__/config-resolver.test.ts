import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ResolvedConfig } from '../types.js';
import { inferConfigFromDocs, resolveConfig } from '../config/resolver.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-config-test-'));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function baseConfig(root: string): ResolvedConfig {
  return {
    root,
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

describe('resolveConfig', () => {
  let tmpDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    cwdSpy?.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('auto-loads config from cwd when --config is not provided', async () => {
    writeFile(
      tmpDir,
      'fea-docs.config.mjs',
      "export default { frameworks: ['react'], aliases: { '@lib': '/tmp/lib' } };\n",
    );

    const resolved = await resolveConfig({});
    expect(resolved.frameworks).toContain('react');
    expect(resolved.aliases['@lib']).toBe('/tmp/lib');
  });
});

describe('inferConfigFromDocs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('infers framework and aliases from nested fea-docs config', async () => {
    writeFile(
      tmpDir,
      'example/fea-docs.config.mjs',
      "export default { frameworks: ['react'], aliases: { '@react-lib': '/tmp/react-lib' } };\n",
    );

    const inferred = await inferConfigFromDocs(baseConfig(tmpDir), ['example/docs/integrations.mdx']);

    expect(inferred.config.frameworks).toContain('react');
    expect(inferred.config.aliases['@react-lib']).toBe('/tmp/react-lib');
    expect(inferred.sources).toHaveLength(1);
  });
});
