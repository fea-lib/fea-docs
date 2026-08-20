import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import ignore from 'ignore';
import type { DocPage, DocsGraph } from '../types.js';
import { DEFAULT_IGNORE_GLOBS, outputIgnoreGlobs, SOURCE_GLOBS } from './defaults.js';

export interface GraphInvocation {
  /** Content root; absolute or relative to the working directory. */
  root: string;
  /** Output directory, absolute or relative to `root`. */
  outDir: string;
}

type IgnoreIndex = Map<string, ignore.Ignore>;

/**
 * ContentGraphEngine recursively discovers all `.md`/`.mdx` files under a
 * root, honors `.gitignore` at the root and every subdirectory level, always
 * skips the tool's own output directory plus `.git`/`node_modules`, and
 * never follows symbolic links.
 *
 * This class owns path normalization: `root` is resolved absolutely and
 * `outDir` is resolved against that root before anything else happens. Every
 * caller (build, tests, later config-based resolution) gets the same
 * normalized contract.
 */
export class ContentGraphEngine {
  private root: string;
  private outDir: string;
  private ignoreGlobs: string[];

  constructor(options: GraphInvocation) {
    this.root = path.resolve(options.root);
    this.outDir = path.resolve(this.root, options.outDir);
    this.ignoreGlobs = [
      ...outputIgnoreGlobs(this.outDir, this.root),
      ...DEFAULT_IGNORE_GLOBS,
    ];
  }

  async scan(): Promise<DocsGraph> {
    const files = await fg(SOURCE_GLOBS, {
      cwd: this.root,
      dot: true,
      followSymbolicLinks: false,
      ignore: this.ignoreGlobs,
    });
    files.sort(comparePosix);
    const ignoreIndex = await this.buildIgnoreIndex();

    const pages: DocPage[] = [];
    for (const relativePath of files) {
      if (this.isIgnoredByGitignore(relativePath, ignoreIndex)) continue;
      if (this.isSymbolicLink(relativePath)) continue;
      pages.push(this.toDocPage(relativePath));
    }

    return { pages, root: this.root, outDir: this.outDir };
  }

  /**
   * Load every `.gitignore` under the root into a directory-indexed map of
   * matchers. Rules inside a file are matched against paths relative to that
   * file's directory, mirroring git semantics.
   */
  private async buildIgnoreIndex(): Promise<IgnoreIndex> {
    const gitignoreFiles = await fg('**/.gitignore', {
      cwd: this.root,
      dot: true,
      followSymbolicLinks: false,
      ignore: this.ignoreGlobs,
    });

    const index = new Map<string, ignore.Ignore>();
    for (const relativePath of gitignoreFiles) {
      const hostDir =
        relativePath === '.gitignore'
          ? ''
          : relativePath.slice(0, -'.gitignore'.length - 1).replaceAll('\\', '/');
      const content = fs.readFileSync(path.join(this.root, relativePath), 'utf-8');
      index.set(hostDir, ignore().add(content));
    }
    return index;
  }

  /**
   * A page is ignored if any `.gitignore` in the chain from the root down to
   * its own directory ignores it. The chain check is ordered shallowest
   * first, so a shallower ignore wins over a deeper one (git never re-enters
   * a directory the root already excluded).
   */
  private isIgnoredByGitignore(relativePath: string, index: IgnoreIndex): boolean {
    const parts = relativePath.split('/');
    for (let depth = 0; depth < parts.length; depth++) {
      const directory = depth === 0 ? '' : parts.slice(0, depth).join('/');
      const matcher = index.get(directory);
      if (matcher && matcher.ignores(parts.slice(depth).join('/'))) {
        return true;
      }
    }
    return false;
  }

  private isSymbolicLink(relativePath: string): boolean {
    return fs.lstatSync(path.join(this.root, relativePath)).isSymbolicLink();
  }

  private toDocPage(relativePath: string): DocPage {
    const extension = relativePath.endsWith('.mdx') ? 'mdx' : 'md';
    const absolutePath = path.join(this.root, relativePath);
    return {
      absolutePath,
      relativePath,
      route: relativePath.slice(0, -(extension.length + 1)),
      ext: extension,
    };
  }
}

function comparePosix(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}