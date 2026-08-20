import { Command } from 'commander';
import { ContentGraphEngine } from '../../content-graph/engine.js';
import { publishSite } from '../../publish/publisher.js';
import { emptySitePage, indexPage } from '../../publish/site-pages.js';
import type { BuildInvocation, BuildResult } from '../../types.js';
import {
  DEFAULT_CONFIG_FILE,
  DEFAULT_OUT_DIR,
  parseBuildOptions,
} from './build-options.js';

/**
 * `fea-docs build`: scan the execution directory for renderable content,
 * honor ignore rules, and emit a static site into the output directory.
 * A tree with no renderable pages still builds: an empty nav plus a message
 * page, exit code 0.
 */
export function buildCommand(): Command {
  return new Command('build')
    .description('Build a static documentation site from the current directory')
    .showHelpAfterError()
    .option('--out-dir <path>', 'Output directory', DEFAULT_OUT_DIR)
    .option('--config <path>', 'Path to a fea-docs config file', DEFAULT_CONFIG_FILE)
    .option('--strict', 'Promote warnings to failures', false)
    .action(async (opts) => {
      const flags = parseBuildOptions(opts);
      const result = await runBuild({
        root: process.cwd(),
        outDir: flags.outDir,
        strict: flags.strict,
        configPath: flags.config,
      });
      for (const warning of result.warnings) {
        console.log(`Warning: ${warning}`);
      }
      console.log(`found ${result.pages.length} page(s)`);
      console.log(`built ${result.emitted.length} file(s) into ${result.outDir}`);
    });
}

/**
 * Run a full build from an invocation and return the deterministic result.
 * Does not print or exit; failures surface as thrown errors. The engine owns
 * path normalization (resolved root and outDir are read back from the graph).
 */
export async function runBuild(invocation: BuildInvocation): Promise<BuildResult> {
  const engine = new ContentGraphEngine(invocation);
  const graph = await engine.scan();

  const files = graph.pages.length === 0 ? [emptySitePage()] : [indexPage(graph.pages)];

  const warnings: string[] = [];
  if (graph.pages.length === 0) {
    warnings.push(`no renderable pages found under ${graph.root}`);
  }

  const emitted = publishSite(files, { outDir: graph.outDir, root: graph.root });
  return { pages: graph.pages, outDir: graph.outDir, emitted, warnings };
}