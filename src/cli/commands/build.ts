import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import { inferConfigFromDocs, resolveConfig } from '../../config/resolver.js';
import { ContentGraphEngine } from '../../content-graph/engine.js';
import { RuntimeAdapter } from '../../runtime/adapter.js';
import { StrictValidator } from '../../strict/validator.js';
import { inferFrameworksFromMdxGraph } from '../../mdx-framework/inferer.js';
import type { ResolvedConfig } from '../../types.js';

export function buildCommand(): Command {
  return new Command('build')
    .description('Generate deployable static docs output')
    .option('--out-dir <path>', 'Output directory', 'dist')
    .option('--name <text>', 'Custom docs site name/title')
    .option('--config <path>', 'Path to an explicit config file')
    .option('--strict', 'Enable strict validation (default in build mode)')
    .option('--ignore <glob...>', 'Additional ignore globs')
    .option('--framework <name...>', 'Enable framework adapters (react, vue, svelte, solid, qwik)')
    .action(async (opts) => {
      const cliFlags: Partial<ResolvedConfig> = {
        strict: true, // build always strict
        ...(opts.name ? { name: String(opts.name) } : {}),
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

        const inferredConfig = await inferConfigFromDocs(
          config,
          graph.pages.map((p) => p.relativePath),
        );
        config.frameworks = inferredConfig.config.frameworks;
        config.aliases = inferredConfig.config.aliases;
        if (inferredConfig.sources.length > 0) {
          console.log(
            pc.cyan(
              `Merged framework/alias config from: ${inferredConfig.sources
                .map((s) => s.replace(`${config.root}/`, ''))
                .join(', ')}`,
            ),
          );
        }

        const inference = inferFrameworksFromMdxGraph(graph, config.aliases);
        if (inference.frameworks.length > 0) {
          const before = new Set(config.frameworks);
          for (const fw of inference.frameworks) {
            before.add(fw);
          }
          config.frameworks = Array.from(before);
          console.log(pc.cyan(`Inferred frameworks from MDX imports: ${inference.frameworks.join(', ')}`));
        }

        // Strict validation
        const validator = new StrictValidator();
        const result = validator.validate(graph);
        result.diagnostics.push(
          ...inference.diagnostics.map((d) => ({
            type: 'error' as const,
            code: d.code,
            message: d.message,
            file: d.file,
          })),
        );
        result.passed = result.passed && inference.diagnostics.length === 0;

        for (const diag of result.diagnostics) {
          const prefix = diag.type === 'error' ? pc.red('ERROR') : pc.yellow('WARN');
          const location = diag.file ? ` [${diag.file}]` : '';
          console.log(`${prefix}${location} ${diag.message}`);
        }

        if (!result.passed) {
          console.error(pc.red('\nBuild failed: strict validation errors found.'));
          process.exit(1);
        }

        const adapter = new RuntimeAdapter({ config, graph });
        console.log(pc.cyan('Preparing Starlight runtime...'));
        await adapter.materialize();
        console.log(pc.cyan(`Runtime cache dir: ${adapter.runtimeDir}`));

        const outDir = path.resolve(opts.outDir);
        console.log(pc.cyan(`Building to ${outDir}...`));
        await adapter.runBuild(outDir);

        console.log(pc.green(`\nBuild complete: ${outDir}`));
      } catch (err) {
        console.error(pc.red('Error:'), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
