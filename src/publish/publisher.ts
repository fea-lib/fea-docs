import fs from 'node:fs';
import path from 'node:path';

/** A file to be written into the output directory. */
export interface EmittedFile {
  relativePath: string;
  content: string;
}

/**
 * Write the emitted files into the output directory deterministically.
 * Prior files are removed first (written like a normal build tool, never a
 * prompt). A read-only or otherwise unwritable output is a hard failure.
 *
 * Refuses output directories that are the root itself or an ancestor of it,
 * so a bad `--out-dir` can never erase the source tree.
 */
export function publishSite(files: EmittedFile[], { outDir, root }: { outDir: string; root: string }): string[] {
  const output = path.resolve(outDir);
  const scope = path.resolve(root);
  if (output === scope || scope.startsWith(output + path.sep)) {
    throw new Error(`output directory '${outDir}' would erase the content root`);
  }

  fs.rmSync(output, { recursive: true, force: true });
  const emitted: string[] = [];
  for (const file of files) {
    const target = path.join(output, file.relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, { encoding: 'utf-8' });
    emitted.push(file.relativePath);
  }
  return emitted;
}