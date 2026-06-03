import { Command } from 'commander';
import pc from 'picocolors';
import { GithubPagesBootstrapper } from '../../gh-pages/bootstrapper.js';

export function setupCommand(): Command {
  const setup = new Command('setup').description('Setup helpers for deployment and integrations');

  setup
    .command('gh-pages')
    .description('Bootstrap GitHub Pages deployment for this repository')
    .option('--base <path>', 'Base URL path for deployed docs (e.g. /my-repo)')
    .option('--generate-docs', 'Generate deployment documentation in the docs directory')
    .action(async (opts) => {
      try {
        const bootstrapper = new GithubPagesBootstrapper({
          root: process.cwd(),
          base: opts.base ? String(opts.base) : undefined,
          generateDocs: opts.generateDocs,
        });
        await bootstrapper.bootstrap();
        console.log(pc.green('GitHub Pages setup complete.'));
      } catch (err) {
        console.error(pc.red('Error:'), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return setup;
}
