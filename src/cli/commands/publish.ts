import { Command } from 'commander';
import pc from 'picocolors';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import os from 'node:os';
import { resolveConfig, inferConfigFromDocs } from '../../config/resolver.js';
import { ContentGraphEngine } from '../../content-graph/engine.js';
import { RuntimeAdapter } from '../../runtime/adapter.js';
import { filterDocsByTarget } from '../../publish/filter.js';
import { collectSources } from '../../publish/source-copier.js';
import type { DocPage, DocsGraph, ResolvedConfig, GitTargetConfig, FileTargetConfig, ResolvedPublishTarget } from '../../types.js';

interface PublishOptions {
  dryRun?: boolean;
  force?: boolean;
  clean?: boolean;
}

interface PublishResult {
  target: string;
  status: 'succeeded' | 'failed';
  reason?: string;
}

export function publishCommand(): Command {
  return new Command('publish')
    .description('Build and deploy docs to one or all configured publish targets')
    .argument('[target]', 'Target name from fea-docs.config.mjs publish section')
    .option('--dry-run', 'Show what would be published without building or deploying')
    .option('--force', 'Skip confirmation prompts (use in CI)')
    .option('--clean', 'Re-clone git repos from scratch instead of reusing cached clones')
    .action(async (target?: string, opts?: PublishOptions) => {
      const results: PublishResult[] = [];

      try {
        const config = await resolveConfig({});
        if (!config.publish || Object.keys(config.publish).length === 0) {
          console.log(pc.yellow('No publish targets configured in fea-docs.config.mjs.'));
          process.exit(0);
        }
        if (target && !config.publish[target]) {
          console.log(pc.red(`Publish target "${target}" not found in config.`));
          console.log(`Available targets: ${Object.keys(config.publish).join(', ')}`);
          process.exit(1);
        }
        const targets = target
          ? [config.publish[target]]
          : Object.values(config.publish);

        config.root = process.cwd();
        console.log(pc.cyan('Scanning for docs...'));
        const engine = new ContentGraphEngine(config);
        const graph = await engine.scan();
        console.log(pc.green(`Found ${graph.pages.length} page(s)`));

        const inferredConfig = await inferConfigFromDocs(
          config,
          graph.pages.map((p) => p.relativePath),
        );

        for (const t of targets) {
          try {
            await publishTarget(t, inferredConfig.config, graph, opts, results);
          } catch (err) {
            results.push({
              target: t.name,
              status: 'failed',
              reason: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } catch (err) {
        console.error(pc.red('Error:'), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      console.log(pc.cyan('\nPublish summary:'));
      for (const r of results) {
        const icon = r.status === 'succeeded' ? pc.green('✓') : pc.red('✗');
        console.log(`  ${icon} ${r.target}: ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
      }
      const failed = results.filter((r) => r.status === 'failed');
      if (failed.length > 0) process.exit(1);
    });
}

async function publishTarget(
  target: ResolvedPublishTarget,
  config: ResolvedConfig,
  graph: DocsGraph,
  opts: PublishOptions | undefined,
  results: PublishResult[],
): Promise<void> {
  const matchedDocs = filterDocsByTarget(graph, target.name);
  if (matchedDocs.length === 0) {
    console.log(pc.yellow(`  No documents match target "${target.name}", skipping.`));
    results.push({ target: target.name, status: 'succeeded' });
    return;
  }

  console.log(pc.cyan(`\nTarget "${target.name}": ${matchedDocs.length} document(s)`));

  // Warn about unknown publishTo values
  for (const doc of matchedDocs) {
    const pt = doc.frontmatter.publishTo;
    if (typeof pt === 'string' && pt !== target.name) {
      console.warn(pc.yellow(`  Document "${doc.relativePath}" references unknown target "${pt}".`));
    } else if (Array.isArray(pt)) {
      for (const t of pt) {
        if (t !== target.name && !config.publish?.[t]) {
          console.warn(pc.yellow(`  Document "${doc.relativePath}" references unknown target "${t}".`));
        }
      }
    }
  }

  // Dry-run
  if (opts?.dryRun) {
    console.log(pc.cyan(`  Type: ${target.type}`));
    console.log(`  Matched docs (${matchedDocs.length}):`);
    for (const doc of matchedDocs) {
      console.log(`    - ${doc.relativePath}`);
    }
    if (target.sourcesTargetDir) {
      console.log(`  Sources → ${target.sourcesTargetDir}`);
    }
    results.push({ target: target.name, status: 'succeeded' });
    return;
  }

  // Confirmation prompt
  if (!opts?.force) {
    const answer = await readlineQuestion(
      `\nPublish ${matchedDocs.length} document(s) to "${target.name}" (${target.type})? (y/N) `,
    );
    if (!answer.toLowerCase().startsWith('y')) {
      console.log(pc.yellow('  Skipped.'));
      results.push({ target: target.name, status: 'succeeded' });
      return;
    }
  }

  // Build in ephemeral dir
  const adapter = new RuntimeAdapter({ config, graph });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `fea-docs-publish-${target.name}-`));
  let buildOutDir: string;

  try {
    buildOutDir = await adapter.createFilteredBuild(matchedDocs, tmpDir, config);
    console.log(pc.green(`  Built ${matchedDocs.length} docs for "${target.name}"`));
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }

  // Collect source files if configured
  let sourceFilesDir: string | undefined;
  if (target.sourcesTargetDir) {
    sourceFilesDir = path.join(tmpDir, 'sources');
    collectSources({
      matchedPages: matchedDocs.map((d) => ({
        absolutePath: d.absolutePath,
        relativePath: d.relativePath,
      })),
      root: config.root,
      outputDir: sourceFilesDir,
    });
  }

  // Deploy
  const deployed = await deployToTarget(target, buildOutDir, sourceFilesDir, matchedDocs.length, opts);
  if (deployed) {
    results.push({ target: target.name, status: 'succeeded' });
  } else {
    results.push({ target: target.name, status: 'failed', reason: 'Deploy failed' });
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

async function deployToTarget(
  target: ResolvedPublishTarget,
  buildDir: string,
  sourceFilesDir: string | undefined,
  docCount: number,
  opts: PublishOptions | undefined,
): Promise<boolean> {
  if (target.type === 'file') {
    const fileCfg = target.config as FileTargetConfig;
    const { publishToFile } = await import('../../publish/file-publisher.js');
    publishToFile({
      targetDir: fileCfg.targetDir,
      sourcesTargetDir: target.sourcesTargetDir,
      buildDir,
      sourceFilesDir,
    });
    return true;
  }

  if (target.type === 'git') {
    const gitCfg = target.config as GitTargetConfig;
    const { publishToGit } = await import('../../publish/git-publisher.js');
    publishToGit({
      repo: gitCfg.repo,
      branch: gitCfg.branch,
      targetDir: gitCfg.targetDir,
      sourcesTargetDir: target.sourcesTargetDir,
      buildDir,
      sourceFilesDir,
      name: target.name,
      docCount,
      clean: opts?.clean,
    });
    return true;
  }

  return false;
}

function readlineQuestion(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
}
