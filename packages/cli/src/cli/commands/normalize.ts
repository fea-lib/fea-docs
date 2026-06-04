import path from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { normalizeVault } from '@fea-docs/normalizer';
import { resolveConfig } from '../../config/resolver.js';
import type { ResolvedConfig } from '../../types.js';

export function normalizeCommand(): Command {
  return new Command('normalize')
    .description('Normalize an Obsidian-style source vault for one publishing target')
    .requiredOption('--target <target>', 'Publishing target ID')
    .option('--out-dir <path>', 'Normalized docs output directory')
    .option('--config <path>', 'Path to an explicit config file')
    .option('--root <path>', 'Source docs root')
    .option('--strict', 'Fail on strict diagnostics')
    .action(async (opts) => {
      const cliFlags: Partial<ResolvedConfig> = {
        ...(opts.root ? { root: String(opts.root) } : {}),
        ...(opts.strict ? { strict: true } : {}),
      };
      const config = await resolveConfig(cliFlags, opts.config);
      const targetId = String(opts.target);
      const outputRoot = path.resolve(
        opts.outDir ? String(opts.outDir) : defaultNormalizedOutput(config.root, targetId),
      );

      try {
        const targets = Object.keys(config.obsidian?.targets ?? {});
        const result = await normalizeVault({
          sourceRoot: config.root,
          outputRoot,
          targetId,
          strict: config.strict,
          configuredTargets: targets,
          ignore: config.ignore,
        });

        console.log(pc.green(`Normalized ${result.manifest.pages.length} page(s) for target "${targetId}".`));
        console.log(pc.cyan(`Output: ${outputRoot}`));
      } catch (err) {
        console.error(pc.red('Error:'), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

export function defaultNormalizedOutput(sourceRoot: string, targetId: string): string {
  return path.join(path.dirname(path.resolve(sourceRoot)), '.fea-docs', 'normalized', targetId);
}
