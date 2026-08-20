/** A single discovered documentation page (md/mdx source). */
export interface DocPage {
  /** Absolute filesystem path to the source file. */
  absolutePath: string;
  /** Path relative to the content root, using forward slashes. */
  relativePath: string;
  /** Rendered output route: relativePath without the markdown extension (e.g. `sub/foo`). */
  route: string;
  /** File extension: 'md' or 'mdx'. */
  ext: 'md' | 'mdx';
}

/** The full set of renderable pages under a root. */
export interface DocsGraph {
  pages: DocPage[];
  /** Absolute path of the content root (normalized by the engine). */
  root: string;
  /** Absolute path of the output directory (normalized by the engine). */
  outDir: string;
}

/** Everything `build` needs to know about an invocation. */
export interface BuildInvocation {
  /** Directory being built (the execution directory); resolved by the engine. */
  root: string;
  /** Output directory, relative to `root` or absolute; resolved by the engine. */
  outDir: string;
  /** `--strict` flag surface; escalates warnings once warning paths land (ticket 12). */
  strict: boolean;
  /** `--config` flag surface; config file resolution lands in ticket 09. */
  configPath?: string;
}

/** Result of a build invocation. */
export interface BuildResult {
  pages: DocPage[];
  /** Absolute path of the written output directory. */
  outDir: string;
  /** Relative paths of files written, in deterministic order. */
  emitted: string[];
  /** Informative warnings surfaced during the build. */
  warnings: string[];
}