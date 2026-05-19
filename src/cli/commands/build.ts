import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import { resolveConfig } from '../../config/resolver.js';
import { ContentGraphEngine } from '../../content-graph/engine.js';
import { NavigationBuilder } from '../../navigation/builder.js';
import { RuntimeAdapter } from '../../runtime/adapter.js';
import { BuildExporter } from '../../build/exporter.js';
import { StrictValidator } from '../../strict/validator.js';
import { ensureGitignore } from '../../utils/gitignore.js';
import type { ResolvedConfig } from '../../types.js';

export function buildCommand(): Command {
  return new Command('build')
    .description('Generate deployable static docs output')
    .option('--out-dir <path>', 'Output directory', 'dist')
    .option('--config <path>', 'Path to an explicit config file')
    .option('--strict', 'Enable strict validation (default in build mode)')
    .option('--ignore <glob...>', 'Additional ignore globs')
    .option('--framework <name...>', 'Enable framework adapters')
    .action(async (opts) => {
      const cliFlags: Partial<ResolvedConfig> = {
        strict: true, // build always strict
        ...(opts.ignore ? { ignore: opts.ignore } : {}),
        ...(opts.framework ? { frameworks: opts.framework } : {}),
      };

      const config = await resolveConfig(cliFlags, opts.config);
      config.root = process.cwd();

      try {
        console.log(pc.cyan('Scanning for docs...'));
        const engine = new ContentGraphEngine(config);
        const graph = await engine.scan();
        console.log(pc.green(`Found ${graph.pages.length} page(s)`));

        // Strict validation
        const validator = new StrictValidator();
        const result = validator.validate(graph);

        for (const diag of result.diagnostics) {
          const prefix = diag.type === 'error' ? pc.red('ERROR') : pc.yellow('WARN');
          const location = diag.file ? ` [${diag.file}]` : '';
          console.log(`${prefix}${location} ${diag.message}`);
        }

        if (!result.passed) {
          console.error(pc.red('\nBuild failed: strict validation errors found.'));
          process.exit(1);
        }

        const navBuilder = new NavigationBuilder();
        const navTree = navBuilder.build(graph);

        const adapter = new RuntimeAdapter({ config, graph, navTree });
        console.log(pc.cyan('Preparing Starlight runtime...'));
        ensureGitignore(config.root);
        await adapter.materialize();

        const outDir = path.resolve(opts.outDir);
        console.log(pc.cyan(`Building to ${outDir}...`));
        await adapter.runBuild(outDir);

        // Copy static assets
        const exporter = new BuildExporter({ graph, outputDir: outDir });
        await exporter.copyAssets();

        console.log(pc.green(`\nBuild complete: ${outDir}`));
      } catch (err) {
        console.error(pc.red('Error:'), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
