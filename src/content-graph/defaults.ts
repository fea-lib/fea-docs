import path from 'node:path';

/** Renderable source file globs discovered recursively. */
export const SOURCE_GLOBS: string[] = ['**/*.md', '**/*.mdx'];

/**
 * Directories that are never scanned or copied, regardless of user config.
 * Root- and nested-anchored forms are both given so a `node_modules` or
 * `.git` directory is excluded at any depth.
 */
export const DEFAULT_IGNORE_GLOBS: string[] = [
  '.git/**',
  '**/.git/**',
  'node_modules/**',
  '**/node_modules/**',
];

/**
 * Glob patterns that keep the tool's own output directory out of the scan,
 * wherever it sits under the tree. This keeps repeated builds from rescanning
 * previously emitted output.
 *
 * Both paths are expected to be normalized (absolute): the content graph
 * engine resolves `root` and `outDir` before calling this.
 */
export function outputIgnoreGlobs(outDir: string, root: string): string[] {
  const rooted = path.relative(root, outDir).replaceAll('\\', '/');
  if (!rooted || rooted === '.' || rooted.startsWith('../')) {
    return [];
  }
  return [`${rooted}/**`, `**/${rooted}/**`];
}