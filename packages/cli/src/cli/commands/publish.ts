import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { artifactFileNames, type FeaDocsPublishSummary, type FeaDocsDiagnostic } from '@fea-docs/schema';
import { normalizeVault } from '@fea-docs/normalizer';
import { resolveConfig } from '../../config/resolver.js';
import { buildDiagnostic, printDiagnosticSummary } from '../../diagnostics/summary.js';
import type { ResolvedConfig, PublishDestinationConfig } from '../../types.js';
import { defaultNormalizedOutput } from './normalize.js';
import { GitPublisher, resolveGitRoot, type PublishDirResult } from '../../publisher/git-publisher.js';

// ---------------------------------------------------------------------------
// CLI command
// ---------------------------------------------------------------------------

export function publishCommand(): Command {
  return new Command('publish')
    .description('Normalize, build, and publish one or all configured targets')
    .option('--target <target>', 'Publishing target ID')
    .option('--all', 'Publish all configured targets')
    .option('--config <path>', 'Path to an explicit config file')
    .option('--root <path>', 'Source docs root')
    .option('--strict', 'Fail on strict diagnostics and missing destination config')
    .option('--skip-git', 'Skip actual git push (normalize only, write publish summary)')
    .action(async (opts) => {
      const cliFlags: Partial<ResolvedConfig> = {
        ...(opts.root ? { root: String(opts.root) } : {}),
        ...(opts.strict ? { strict: true } : {}),
      };
      const config = await resolveConfig(cliFlags, opts.config);
      const configuredTargets = Object.keys(config.obsidian?.targets ?? {});
      const targets = opts.all ? configuredTargets : [String(opts.target ?? '')].filter(Boolean);
      const skipGit: boolean = Boolean(opts.skipGit);
      const strict = config.obsidian?.strict ?? config.strict ?? false;

      if (targets.length === 0) {
        console.error(pc.red('Error:'), 'Pass --target <target> or --all.');
        process.exit(1);
      }

      // Determine git root once (used for all same-repo destinations)
      let gitRoot: string | undefined;
      if (!skipGit) {
        try {
          gitRoot = resolveGitRoot(config.root);
        } catch (err) {
          console.error(
            pc.yellow('Warning:'),
            'Could not resolve git root — git publishing will be skipped.',
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      const publisher = gitRoot ? new GitPublisher(gitRoot) : undefined;

      let allSucceeded = true;
      const results: Array<{ targetId: string; status: 'success' | 'failed'; error?: string }> = [];

      for (const targetId of targets) {
        try {
          const summary = await publishTarget(config, targetId, configuredTargets, publisher, strict);
          console.log(pc.green(`✓ Published target "${targetId}".`));
          printDiagnosticSummary(summary.diagnostics);
          results.push({ targetId, status: 'success' });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(pc.red(`✗ Failed target "${targetId}":`), message);
          results.push({ targetId, status: 'failed', error: message });
          allSucceeded = false;

          // In strict mode, stop after the first failure
          if (strict) {
            console.error(pc.red('Stopping: strict mode is enabled.'));
            break;
          }
        }
      }

      // Print publish-all summary
      if (targets.length > 1) {
        console.log('');
        console.log(pc.bold('Publish summary:'));
        for (const r of results) {
          const icon = r.status === 'success' ? pc.green('✓') : pc.red('✗');
          console.log(`  ${icon} ${r.targetId}${r.error ? `: ${r.error}` : ''}`);
        }
      }

      if (!allSucceeded) {
        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// Core publish logic
// ---------------------------------------------------------------------------

/**
 * Run the full publish pipeline for one target:
 *   1. Normalize → normalized docs in outputRoot
 *   2. Push normalized docs to configured destination (if configured)
 *   3. Push static output to configured destination (if configured + staticOutputDir provided)
 *
 * Throws on any error. The caller is responsible for per-target error collection.
 */
export async function publishTarget(
  config: ResolvedConfig,
  targetId: string,
  configuredTargets: string[],
  publisher?: GitPublisher,
  strict?: boolean,
  /** Override the static output dir (e.g. for testing). Skipped if not provided. */
  staticOutputDir?: string,
): Promise<FeaDocsPublishSummary> {
  const targetConfig = config.obsidian?.targets?.[targetId];
  if (!targetConfig) {
    throw new Error(`Unknown target "${targetId}". Configure it before publishing.`);
  }

  const isStrict = strict ?? config.obsidian?.strict ?? config.strict ?? false;

  const normalizedOutput = defaultNormalizedOutput(config.root, targetId);
  const outDir = path.join(path.dirname(config.root), '.fea-docs', 'publish', targetId);

  try {
    // Validate destination config in strict mode.
    if (isStrict && !targetConfig.normalizedDocs && !targetConfig.staticOutput) {
      throw new Error(
        `Target "${targetId}" has no normalizedDocs or staticOutput destination configured.`,
      );
    }

    // ── Step 1: Normalize ───────────────────────────────────────────────────
    const result = await normalizeVault({
      sourceRoot: config.root,
      outputRoot: normalizedOutput,
      targetId,
      strict: isStrict,
      configuredTargets,
      ignore: [...(config.ignore ?? []), ...(config.obsidian?.ignorePaths ?? [])],
      publicAssetDirs: config.obsidian?.publicAssetDirs,
      features: config.obsidian?.features,
    });

    const diagnostics: FeaDocsDiagnostic[] = result.diagnostics.diagnostics;
    let normalizedDocsRef: FeaDocsPublishSummary['normalizedDocsRef'];
    let staticOutputRef: FeaDocsPublishSummary['staticOutputRef'];

    // ── Step 2: Publish normalized docs ────────────────────────────────────
    if (targetConfig.normalizedDocs && publisher) {
      normalizedDocsRef = await publishArtifact(
        publisher,
        normalizedOutput,
        targetConfig.normalizedDocs,
        `chore(fea-docs): publish normalized docs for ${targetId}`,
      );
    } else if (targetConfig.normalizedDocs && !publisher) {
      normalizedDocsRef = {
        destination: targetConfig.normalizedDocs,
        skipped: true,
        reason: 'no-git-publisher',
      };
    }

    // ── Step 3: Publish static output ──────────────────────────────────────
    if (targetConfig.staticOutput && staticOutputDir && publisher) {
      staticOutputRef = await publishArtifact(
        publisher,
        staticOutputDir,
        targetConfig.staticOutput,
        `chore(fea-docs): publish static output for ${targetId}`,
      );
    } else if (targetConfig.staticOutput && !staticOutputDir) {
      staticOutputRef = {
        destination: targetConfig.staticOutput,
        skipped: true,
        reason: 'static-output-not-built',
      };
    } else if (targetConfig.staticOutput && !publisher) {
      staticOutputRef = {
        destination: targetConfig.staticOutput,
        skipped: true,
        reason: 'no-git-publisher',
      };
    }

    // ── Step 4: Write publish summary ───────────────────────────────────────
    const summary: FeaDocsPublishSummary = {
      version: 1,
      targetId,
      generatedAt: new Date().toISOString(),
      normalizedDocs: targetConfig.normalizedDocs,
      staticOutput: targetConfig.staticOutput,
      normalizedDocsRef,
      staticOutputRef,
      status: 'success',
      diagnostics,
    };

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, artifactFileNames.publish), `${JSON.stringify(summary, null, 2)}\n`);

    return summary;
  } catch (err) {
    fs.rmSync(normalizedOutput, { recursive: true, force: true });
    const message = err instanceof Error ? err.message : String(err);
    const summary: FeaDocsPublishSummary = {
      version: 1,
      targetId,
      generatedAt: new Date().toISOString(),
      normalizedDocs: targetConfig.normalizedDocs,
      staticOutput: targetConfig.staticOutput,
      status: 'failed',
      error: message,
      diagnostics: [buildDiagnostic({
        code: 'PUBLISH_ERROR',
        message,
        suggestion: 'Fix the failed normalize, build, destination, or git publish step and run publish again.',
      })],
    };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, artifactFileNames.publish), `${JSON.stringify(summary, null, 2)}\n`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function publishArtifact(
  publisher: GitPublisher,
  sourceDir: string,
  dest: PublishDestinationConfig,
  message: string,
): Promise<FeaDocsPublishSummary['normalizedDocsRef']> {
  const result: PublishDirResult = await publisher.publishDir(sourceDir, dest, { message });
  return {
    destination: dest,
    sha: result.sha,
    skipped: result.skipped,
    reason: result.reason,
  };
}
