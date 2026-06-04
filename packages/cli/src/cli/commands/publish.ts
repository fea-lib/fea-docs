import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { artifactFileNames, type FeaDocsPublishSummary } from '@fea-docs/schema';
import { normalizeVault } from '@fea-docs/normalizer';
import { resolveConfig } from '../../config/resolver.js';
import type { ResolvedConfig } from '../../types.js';
import { defaultNormalizedOutput } from './normalize.js';

export function publishCommand(): Command {
  return new Command('publish')
    .description('Run the baseline target publishing workflow')
    .option('--target <target>', 'Publishing target ID')
    .option('--all', 'Publish all configured targets')
    .option('--config <path>', 'Path to an explicit config file')
    .option('--root <path>', 'Source docs root')
    .option('--strict', 'Fail on strict diagnostics')
    .action(async (opts) => {
      const cliFlags: Partial<ResolvedConfig> = {
        ...(opts.root ? { root: String(opts.root) } : {}),
        ...(opts.strict ? { strict: true } : {}),
      };
      const config = await resolveConfig(cliFlags, opts.config);
      const configuredTargets = Object.keys(config.obsidian?.targets ?? {});
      const targets = opts.all ? configuredTargets : [String(opts.target ?? '')].filter(Boolean);

      if (targets.length === 0) {
        console.error(pc.red('Error:'), 'Pass --target <target> or --all.');
        process.exit(1);
      }

      try {
        for (const targetId of targets) {
          await publishTarget(config, targetId, configuredTargets);
          console.log(pc.green(`Published baseline summary for target "${targetId}".`));
        }
      } catch (err) {
        console.error(pc.red('Error:'), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

async function publishTarget(config: ResolvedConfig, targetId: string, configuredTargets: string[]): Promise<void> {
  const targetConfig = config.obsidian?.targets?.[targetId];
  if (!targetConfig) {
    throw new Error(`Unknown target "${targetId}". Configure it before publishing.`);
  }

  const normalizedOutput = defaultNormalizedOutput(config.root, targetId);
  const result = await normalizeVault({
    sourceRoot: config.root,
    outputRoot: normalizedOutput,
    targetId,
    strict: config.obsidian?.strict ?? config.strict,
    configuredTargets,
    ignore: [...(config.ignore ?? []), ...(config.obsidian?.ignorePaths ?? [])],
    publicAssetDirs: config.obsidian?.publicAssetDirs,
    features: config.obsidian?.features,
  });

  const summary: FeaDocsPublishSummary = {
    version: 1,
    targetId,
    generatedAt: new Date().toISOString(),
    normalizedDocs: targetConfig.normalizedDocs,
    staticOutput: targetConfig.staticOutput,
    status: 'success',
    diagnostics: result.diagnostics.diagnostics,
  };

  const outDir = path.join(path.dirname(config.root), '.fea-docs', 'publish', targetId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, artifactFileNames.publish), `${JSON.stringify(summary, null, 2)}\n`);
}
