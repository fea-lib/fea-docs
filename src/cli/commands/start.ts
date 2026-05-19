import { Command } from 'commander';
import pc from 'picocolors';
import { execSync } from 'node:child_process';
import { resolveConfig } from '../../config/resolver.js';
import { ContentGraphEngine } from '../../content-graph/engine.js';
import { NavigationBuilder } from '../../navigation/builder.js';
import { RuntimeAdapter } from '../../runtime/adapter.js';
import { SessionCacheManager } from '../../cache/manager.js';
import type { ResolvedConfig } from '../../types.js';

export function startCommand(): Command {
  return new Command('start')
    .description('Start a local Starlight docs preview from the current directory')
    .option('--port <number>', 'Port to use for the dev server', (v) => Number(v))
    .option('--open', 'Open the browser automatically on start')
    .option('--config <path>', 'Path to an explicit config file')
    .option('--strict', 'Enable strict validation mode')
    .option(
      '--ignore <glob...>',
      'Additional ignore globs',
    )
    .option('--framework <name...>', 'Enable framework adapters (react, vue, svelte, solid)')
    .option('--tailscale-serve', 'Enable Tailscale serve integration')
    .option('--caffeinate', 'Prevent macOS sleep during session')
    .option('--expose', 'Explicitly consent to remote exposure')
    .action(async (opts) => {
      const cliFlags: Partial<ResolvedConfig> = {
        ...(opts.port !== undefined ? { port: opts.port } : {}),
        ...(opts.open ? { open: true } : {}),
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

        // Build navigation
        const navBuilder = new NavigationBuilder();
        const navTree = navBuilder.build(graph);

        // Session cache
        const cache = new SessionCacheManager(config.root);
        const cacheHit = cache.isValid(config);

        // Materialize Starlight app
        const adapter = new RuntimeAdapter({ config, graph, navTree });
        if (!cacheHit) {
          console.log(pc.cyan('Preparing Starlight runtime...'));
          await adapter.materialize();
          cache.save(config);
        }

        // Platform features
        if (opts.caffeinate) {
          startCaffeinate();
        }

        // Start dev server
        console.log(pc.cyan(`Starting dev server on port ${config.port}...`));
        const port = await adapter.startDev(config.port);
        const url = `http://localhost:${port}`;
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
        process.on('SIGINT', () => {
          adapter.stopDev();
          process.exit(0);
        });
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
    execSync(`tailscale serve --bg http://localhost:${port}`, { stdio: 'inherit' });
  } catch {
    console.warn(pc.yellow('Warning: tailscale serve failed. Is Tailscale installed?'));
  }
}
