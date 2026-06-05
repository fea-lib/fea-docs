import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ResolvedConfig } from '../types.js';
import { feaDocsWorkspaceCacheDir } from '../utils/cache-dir.js';

export interface CacheEntry {
  fingerprint: string;
  createdAt: number;
}

/**
 * SessionCacheManager persists a fingerprint of scope/config between runs.
 * When the fingerprint matches, downstream steps can skip expensive work.
 */
export class SessionCacheManager {
  private cacheDir: string;
  private cachePath: string;

  constructor(root: string) {
    this.cacheDir = path.join(feaDocsWorkspaceCacheDir(root), 'cache');
    this.cachePath = path.join(this.cacheDir, 'session.json');
  }

  private fingerprint(config: ResolvedConfig, pages: string[] = []): string {
    const sig = JSON.stringify({
      root: config.root,
      base: config.base,
      ignore: config.ignore,
      frameworks: config.frameworks,
      aliases: config.aliases,
      obsidianFeatures: config.obsidian?.features,
      pages: [...pages].sort(),
    });
    return crypto.createHash('sha256').update(sig).digest('hex');
  }

  /** Returns true if the config and page list match the cached fingerprint. */
  isValid(config: ResolvedConfig, pages: string[] = []): boolean {
    if (!fs.existsSync(this.cachePath)) return false;
    try {
      const entry: CacheEntry = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
      return entry.fingerprint === this.fingerprint(config, pages);
    } catch {
      return false;
    }
  }

  /** Persist the current config fingerprint. */
  save(config: ResolvedConfig, pages: string[] = []): void {
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const entry: CacheEntry = {
      fingerprint: this.fingerprint(config, pages),
      createdAt: Date.now(),
    };
    fs.writeFileSync(this.cachePath, JSON.stringify(entry, null, 2));
  }

  /** Invalidate the cache (e.g. on error or explicit reset). */
  invalidate(): void {
    if (fs.existsSync(this.cachePath)) {
      fs.rmSync(this.cachePath);
    }
  }
}
