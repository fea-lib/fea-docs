import { Command } from 'commander';
import { buildCommand } from './commands/build.js';

export const program = new Command();

program
  .name('fea-docs')
  .description('Build a static documentation site from a directory of Markdown/MDX files')
  .version('0.1.0')
  .argument('[command]', 'subcommand to perform')
  .showHelpAfterError()
  .action((command: string | undefined) => {
    if (command === undefined) {
      program.help();
      return;
    }
    program.error(`Unknown command '${command}'.`);
  });

program.addCommand(buildCommand());