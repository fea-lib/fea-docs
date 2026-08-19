import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionCacheManager } from '../cache/manager.js';
import type { ResolvedConfig } from '../types.js';

const baseConfig: ResolvedConfig = {
  name: undefined,
  title: undefined,
  root: '/tmp/test',
  base: '/',
  ignore: [],
  port: 4321,
  open: false,
  strict: false,
  slugOverrides: {},
  frameworks: [],
  aliases: {},
  dependencies: {},
  tailscaleServe: false,
  caffeinate: false,
  expose: false,
};

describe('SessionCacheManager', () => {
  let tmpDir: string;
  let manager: SessionCacheManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-cache-test-'));
    manager = new SessionCacheManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false when no cache exists', () => {
    const config = { ...baseConfig, root: tmpDir };
    expect(manager.isValid(config)).toBe(false);
  });

  it('returns true after saving the same config', () => {
    const config = { ...baseConfig, root: tmpDir };
    manager.save(config);
    expect(manager.isValid(config)).toBe(true);
  });

  it('returns false after config change', () => {
    const config = { ...baseConfig, root: tmpDir };
    manager.save(config);

    const changed = { ...config, ignore: ['**/drafts/**'] };
    expect(manager.isValid(changed)).toBe(false);
  });

  it('returns false after invalidation', () => {
    const config = { ...baseConfig, root: tmpDir };
    manager.save(config);
    manager.invalidate();
    expect(manager.isValid(config)).toBe(false);
  });

  it('same dependencies yield same fingerprint', () => {
    const configA = { ...baseConfig, root: tmpDir, dependencies: { 'left-pad': '^1.0.0' } };
    const configB = { ...baseConfig, root: tmpDir, dependencies: { 'left-pad': '^1.0.0' } };

    manager.save(configA);
    expect(manager.isValid(configB)).toBe(true);
  });

  it('different dependencies yield different fingerprint', () => {
    const configA = { ...baseConfig, root: tmpDir, dependencies: { 'left-pad': '^1.0.0' } };
    const configB = { ...baseConfig, root: tmpDir, dependencies: { 'right-pad': '^2.0.0' } };

    manager.save(configA);
    expect(manager.isValid(configB)).toBe(false);
  });
});
