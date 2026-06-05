import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import ignoreLib from 'ignore';
// The `ignore` package exports itself as both a function and a module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createIgnore: () => ReturnType<typeof ignoreLib['default']> = (ignoreLib as any).default ?? ignoreLib;
import type { DocsGraph, ResolvedConfig } from '../types.js';
import { DEFAULT_IGNORE_GLOBS } from './defaults.js';
import { parseDocFile } from './parser.js';
import { feaDocsWorkspaceCacheDir } from '../utils/cache-dir.js';

interface GraphCacheEntry {
  fingerprint: string;
  graph: DocsGraph;
}

/**
 * ContentGraphEngine discovers all Markdown/MDX files under the configured
 * scope root, applies ignore rules, and emits a normalized DocsGraph.
 */
export class ContentGraphEngine {
  private root: string;
  private ignoreGlobs: string[];
  private cachePath: string;

  constructor(config: Pick<ResolvedConfig, 'root' | 'ignore'>) {
    this.root = config.root;
    this.ignoreGlobs = [...DEFAULT_IGNORE_GLOBS, ...config.ignore];
    this.cachePath = path.join(feaDocsWorkspaceCacheDir(this.root), 'cache', 'content-graph.json');
  }

  /**
   * Build the gitignore-based ignore filter for the scope root.
   */
  private buildGitignoreFilter(): ReturnType<typeof ignoreLib.default> | null {
    const gitignorePath = path.join(this.root, '.gitignore');
    if (!fs.existsSync(gitignorePath)) return null;

    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    return createIgnore().add(gitignoreContent);
  }

  /**
   * Scan the scope root and return all discovered doc files as a DocsGraph.
   */
  async scan(): Promise<DocsGraph> {
    const gitignoreFilter = this.buildGitignoreFilter();

    // Use fast-glob to find all md/mdx files, excluding default ignores
    const files = await fg(['**/*.md', '**/*.mdx'], {
      cwd: this.root,
      ignore: this.ignoreGlobs,
      dot: true,
      followSymbolicLinks: false,
    });

    // Sort for stable ordering
    files.sort();

    // Apply gitignore filter
    const filtered = gitignoreFilter
      ? files.filter((f) => !gitignoreFilter.ignores(f))
      : files;

    const fingerprint = this.fingerprint(filtered);
    const cached = this.readCache(fingerprint);
    if (cached) return cached;

    const pages = filtered.map((relativePath) => {
      const absolutePath = path.join(this.root, relativePath);
      return parseDocFile(absolutePath, relativePath);
    });

    const graph = { pages, root: this.root };
    this.writeCache(fingerprint, graph);
    return graph;
  }

  private fingerprint(files: string[]): string {
    return JSON.stringify(files.map((relativePath) => {
      const stat = fs.statSync(path.join(this.root, relativePath));
      return [relativePath, stat.size, stat.mtimeMs];
    }));
  }

  private readCache(fingerprint: string): DocsGraph | null {
    if (!fs.existsSync(this.cachePath)) return null;
    try {
      const entry = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8')) as GraphCacheEntry;
      return entry.fingerprint === fingerprint ? entry.graph : null;
    } catch {
      return null;
    }
  }

  private writeCache(fingerprint: string, graph: DocsGraph): void {
    fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
    fs.writeFileSync(this.cachePath, `${JSON.stringify({ fingerprint, graph }, null, 2)}\n`);
  }
}
