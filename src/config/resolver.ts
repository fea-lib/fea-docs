import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ResolvedConfig } from '../types.js';
import { normalizeBasePath } from '../utils/base-path.js';

const CONFIG_CANDIDATES = [
  'fea-docs.config.mjs',
  'fea-docs.config.js',
  'fea-docs.config.cjs',
  'fea-docs.config.ts',
];

const SUPPORTED_FRAMEWORKS = new Set(['react', 'vue', 'svelte', 'solid', 'qwik']);

const DEFAULT_CONFIG: ResolvedConfig = {
  name: undefined,
  title: undefined,
  root: process.cwd(),
  base: '/',
  ignore: [],
  port: 4321,
  open: false,
  strict: false,
  frameworks: [],
  aliases: {},
  dependencies: {},
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

  const configPath = configFilePath ?? findConfigInCwd();

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
    dependencies: {
      ...(fileConfig.dependencies ?? {}),
      ...(cliFlags.dependencies ?? {}),
    },
    base: normalizeBasePath(cliFlags.base ?? envConfig.base ?? fileConfig.base ?? DEFAULT_CONFIG.base),
  };
}

function findConfigInCwd(cwd = process.cwd()): string | null {
  for (const name of CONFIG_CANDIDATES) {
    const candidate = path.join(cwd, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

interface InferredConfigResult {
  config: ResolvedConfig;
  sources: string[];
}

/**
 * Infer additional framework and alias config from docs subtrees.
 * Explicit CLI/CWD config remains authoritative.
 */
export async function inferConfigFromDocs(
  config: ResolvedConfig,
  relativeDocPaths: string[],
): Promise<InferredConfigResult> {
  const root = path.resolve(config.root);
  const candidateDirs = new Set<string>();

  for (const relPath of relativeDocPaths) {
    let dir = path.resolve(root, path.dirname(relPath));
    while (true) {
      candidateDirs.add(dir);
      if (dir === root) break;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  const discoveredConfigs = new Set<string>();
  for (const dir of candidateDirs) {
    for (const name of CONFIG_CANDIDATES) {
      const candidatePath = path.join(dir, name);
      if (fs.existsSync(candidatePath)) {
        discoveredConfigs.add(candidatePath);
        break;
      }
    }
  }

  if (discoveredConfigs.size === 0) {
    return { config, sources: [] };
  }

  const inferredFrameworks = [...config.frameworks];
  const inferredAliases = { ...config.aliases };
  const inferredDependencies = { ...config.dependencies };
  const sources = Array.from(discoveredConfigs).sort((a, b) => a.length - b.length);

  for (const source of sources) {
    const raw = await import(pathToFileURL(source).href);
    const fromFile = (raw.default ?? raw) as Partial<ResolvedConfig>;

    for (const fw of fromFile.frameworks ?? []) {
      if (!SUPPORTED_FRAMEWORKS.has(fw)) continue;
      if (!inferredFrameworks.includes(fw)) {
        inferredFrameworks.push(fw);
      }
    }

    for (const [aliasKey, aliasPath] of Object.entries(fromFile.aliases ?? {})) {
      if (!(aliasKey in inferredAliases)) {
        inferredAliases[aliasKey] = aliasPath;
      }
    }

    for (const [depKey, depVersion] of Object.entries(fromFile.dependencies ?? {})) {
      if (!(depKey in inferredDependencies)) {
        inferredDependencies[depKey] = depVersion;
      }
    }
  }

  return {
    config: {
      ...config,
      frameworks: inferredFrameworks,
      aliases: inferredAliases,
      dependencies: inferredDependencies,
    },
    sources,
  };
}
