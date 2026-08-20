import { Command, CommanderError } from 'commander';
import { program } from '../cli/program.js';

/**
 * Parse CLI arguments like the real binary, but intercept `process.exit`
 * calls and return the exit code instead. Used by CLI tests to assert the
 * full invocation surface (help, unknown commands/flags, exit codes).
 */
export async function runCliForTest(argv: string[]): Promise<number> {
  program.exitOverride();
  for (const command of program.commands) {
    if (command instanceof Command) command.exitOverride();
  }
  try {
    await program.parseAsync(argv, { from: 'user' });
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) return err.exitCode ?? 1;
    return 1;
  }
}