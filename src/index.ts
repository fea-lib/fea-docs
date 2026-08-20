export { program } from './cli/program.js';
export { runBuild } from './cli/commands/build.js';
export {
  DEFAULT_CONFIG_FILE,
  DEFAULT_OUT_DIR,
  buildOptionsSchema,
  parseBuildOptions,
} from './cli/commands/build-options.js';
export { ContentGraphEngine } from './content-graph/engine.js';
export { DEFAULT_IGNORE_GLOBS, SOURCE_GLOBS, outputIgnoreGlobs } from './content-graph/defaults.js';
export type { BuildCliOptions } from './cli/commands/build-options.js';
export type { BuildInvocation, BuildResult, DocPage, DocsGraph } from './types.js';