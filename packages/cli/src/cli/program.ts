import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { buildCommand } from './commands/build.js';
import { setupCommand } from './commands/setup.js';
import { normalizeCommand } from './commands/normalize.js';
import { auditCommand } from './commands/audit.js';
import { publishCommand } from './commands/publish.js';

export const program = new Command();

program
  .name('fea-docs')
  .description('Zero-config Starlight docs from any directory')
  .version('0.1.0');

program.addCommand(startCommand());
program.addCommand(buildCommand());
program.addCommand(setupCommand());
program.addCommand(auditCommand());
program.addCommand(normalizeCommand());
program.addCommand(publishCommand());
