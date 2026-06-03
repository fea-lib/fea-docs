import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { DocsGraph } from '../types.js';

export interface BuildExporterOptions {
  graph: DocsGraph;
  outputDir: string;
}

/**
 * BuildExporter produces deployable static output.
 * - Copies assets from the source root into the output directory.
 * - Deterministic output keyed by slug mapping.
 */
export class BuildExporter {
  private options: BuildExporterOptions;

  constructor(options: BuildExporterOptions) {
    this.options = options;
  }

  /**
   * Copy all non-markdown static assets referenced in the source root.
   */
  async copyAssets(): Promise<void> {
    const { graph, outputDir } = this.options;
    const assetsOutDir = path.join(outputDir, '_assets');
    fs.mkdirSync(assetsOutDir, { recursive: true });

    // Walk source root for non-md/mdx files and copy them
    this.copyDir(graph.root, assetsOutDir, graph.root);
  }

  private copyDir(dir: string, outBase: string, root: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath);

      // Skip markdown files and hidden/ignored dirs
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'dist'
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        this.copyDir(fullPath, outBase, root);
      } else if (!/\.(md|mdx)$/.test(entry.name)) {
        const outPath = path.join(outBase, relPath);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.copyFileSync(fullPath, outPath);
      }
    }
  }
}
