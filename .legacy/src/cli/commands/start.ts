import { Command } from 'commander';
import pc from 'picocolors';
import { execSync } from 'node:child_process';
import { inferConfigFromDocs, resolveConfig } from '../../config/resolver.js';
import { ContentGraphEngine } from '../../content-graph/engine.js';
import { RuntimeAdapter } from '../../runtime/adapter.js';
import { SessionCacheManager } from '../../cache/manager.js';
import { inferFrameworksFromMdxGraph } from '../../mdx-framework/inferer.js';
import type { ResolvedConfig } from '../../types.js';
import { joinBasePath } from '../../utils/base-path.js';

export function startCommand(): Command {
  return new Command('start')
    .description('Start a local Starlight docs preview from the current directory')
    .option('--port <number>', 'Port to use for the dev server', (v) => Number(v))
    .option('--open', 'Open the browser automatically on start')
    .option('--name <text>', 'Custom docs site name/title')
    .option('--base <path>', 'Base URL path for deployed docs (e.g. /my-repo)')
    .option('--config <path>', 'Path to an explicit config file')
    .option('--strict', 'Enable strict validation mode')
    .option(
      '--ignore <glob...>',
      'Additional ignore globs',
    )
    .option('--framework <name...>', 'Enable framework adapters (react, vue, svelte, solid, qwik)')
    .option('--tailscale-serve, --tailscale', 'Enable Tailscale serve integration')
    .option('--caffeinate', 'Prevent macOS sleep during session')
    .option('--expose', 'Explicitly consent to remote exposure')
    .action(async (opts) => {
      const cliFlags: Partial<ResolvedConfig> = {
        ...(opts.port !== undefined ? { port: opts.port } : {}),
        ...(opts.open ? { open: true } : {}),
        ...(opts.name ? { name: String(opts.name) } : {}),
        ...(opts.base ? { base: String(opts.base) } : {}),
        ...(opts.strict ? { strict: true } : {}),
        ...(opts.ignore ? { ignore: opts.ignore } : {}),
        ...(opts.framework ? { frameworks: opts.framework } : {}),
        ...(opts.tailscaleServe ? { tailscaleServe: true } : {}),
        ...(opts.caffeinate ? { caffeinate: true } : {}),
        ...(opts.expose ? { expose: true } : {}),
      };

      const config = await resolveConfig(cliFlags, opts.config);
      config.root = process.cwd();

      try {
        // Discover content
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

        for (const diag of inference.diagnostics) {
          console.warn(pc.yellow(`WARN [${diag.file}] ${diag.message}`));
        }
        if (config.strict && inference.diagnostics.length > 0) {
          throw new Error('Strict mode failed due to unresolved local MDX imports.');
        }

        // Session cache
        const pageRelPaths = graph.pages.map((p) => p.relativePath);
        const cache = new SessionCacheManager(config.root);
        const cacheHit = cache.isValid(config, pageRelPaths);

        // Materialize Starlight app
        const adapter = new RuntimeAdapter({ config, graph });
        console.log(pc.cyan(cacheHit ? 'Refreshing Starlight runtime...' : 'Preparing Starlight runtime...'));
        await adapter.materialize({ fresh: !cacheHit });
        console.log(pc.cyan(`Runtime cache dir: ${adapter.runtimeDir}`));
        cache.save(config, pageRelPaths);

        // Platform features
        if (opts.caffeinate) {
          startCaffeinate();
        }

        // Start dev server
        console.log(pc.cyan(`Starting dev server on port ${config.port}...`));
        const port = await adapter.startDev(config.port);
        console.log(`##FEA_DOCS_PORT=${port}##`);
        const url = `http://localhost:${port}${joinBasePath(config.base, '/')}`;
        console.log(`\n${pc.green('Docs available at:')} ${pc.bold(pc.underline(url))}\n`);

        if (config.open) {
          const { default: openBrowser } = await import('open');
          await openBrowser(url);
        }

        if (opts.tailscaleServe) {
          if (!config.expose) {
            console.warn(
              pc.yellow(
                'Warning: --tailscale-serve requires --expose consent. Skipping.',
              ),
            );
          } else {
            startTailscaleServe(port);
          }
        }

        // Keep process alive
        let shuttingDown = false;

        const shutdown: NodeJS.SignalsListener = (signal) => {
          if (shuttingDown) return;
          shuttingDown = true;
          console.error(`Received ${signal}, shutting down...`);
          adapter.stopDev();
          process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      } catch (err) {
        console.error(pc.red('Error:'), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

function startCaffeinate(): void {
  if (process.platform !== 'darwin') {
    console.warn(
      pc.yellow('Warning: --caffeinate is only available on macOS. Ignoring.'),
    );
    return;
  }
  try {
    execSync('which caffeinate', { stdio: 'ignore' });
    const { spawn } = require('node:child_process');
    spawn('caffeinate', ['-i'], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    console.warn(pc.yellow('Warning: caffeinate not found on this system.'));
  }
}

function startTailscaleServe(port: number): void {
  try {
    execSync(`tailscale serve --bg --https=${port} http://localhost:${port}`, { stdio: 'inherit' });
  } catch {
    console.warn(pc.yellow('Warning: tailscale serve failed. Is Tailscale installed?'));
  }
}
