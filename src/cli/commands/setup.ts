import { Command } from 'commander';
import pc from 'picocolors';
import { GithubPagesBootstrapper } from '../../gh-pages/bootstrapper.js';

export function setupCommand(): Command {
  const setup = new Command('setup').description('Setup helpers for deployment and integrations');

  setup
    .command('gh-pages')
    .description('Bootstrap GitHub Pages deployment for this repository')
    .option('--generate-docs', 'Generate deployment documentation in the docs directory')
    .action(async (opts) => {
      try {
        const bootstrapper = new GithubPagesBootstrapper({
          root: process.cwd(),
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
