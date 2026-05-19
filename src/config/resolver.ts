import fs from 'node:fs';
import path from 'node:path';
import type { ResolvedConfig } from '../types.js';

const DEFAULT_CONFIG: ResolvedConfig = {
  root: process.cwd(),
  ignore: [],
  port: 4321,
  open: false,
  strict: false,
  frameworks: [],
  aliases: {},
  tailscaleServe: false,
  caffeinate: false,
  expose: false,
};

/**
 * Load and merge configuration:
 * Priority: CLI flags > environment variables > config file > defaults.
 */
export async function resolveConfig(
  cliFlags: Partial<ResolvedConfig>,
  configFilePath?: string,
): Promise<ResolvedConfig> {
  let fileConfig: Partial<ResolvedConfig> = {};

  const configPath = configFilePath ?? null;

  if (configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    const raw = await import(path.resolve(configPath));
    fileConfig = raw.default ?? raw;
  }

  // Environment variable overrides
  const envPort = process.env['FEA_DOCS_PORT'];
  const envConfig: Partial<ResolvedConfig> = {
    ...(envPort ? { port: Number(envPort) } : {}),
  };

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envConfig,
    ...cliFlags,
    // Arrays are merged rather than replaced
    ignore: [
      ...(DEFAULT_CONFIG.ignore),
      ...(fileConfig.ignore ?? []),
      ...(cliFlags.ignore ?? []),
    ],
    frameworks: [
      ...(fileConfig.frameworks ?? []),
      ...(cliFlags.frameworks ?? []),
    ],
    aliases: {
      ...(fileConfig.aliases ?? {}),
      ...(cliFlags.aliases ?? {}),
    },
  };
}
