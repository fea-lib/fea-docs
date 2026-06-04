export type FrameworkAdapter = 'react' | 'vue' | 'svelte' | 'solid' | 'qwik';

/** A single discovered documentation page. */
export interface DocPage {
  /** Absolute filesystem path to the source file. */
  absolutePath: string;
  /** Path relative to the content root (CWD or scope). */
  relativePath: string;
  /**
   * Starlight Content Layer entry id: relativePath without extension,
   * lowercased. This is the URL path Starlight actually serves the page at.
   * e.g. README.md → "readme", docs/1-prd.md → "docs/1-prd"
   */
  entryId: string;
  /** Human-readable label resolved via title -> H1 -> filename chain. */
  label: string;
  /** Frontmatter extracted from the file (may be empty). */
  frontmatter: Record<string, unknown>;
  /** Whether this page is a section index (README). */
  isSectionIndex: boolean;
  /** File extension: 'md' or 'mdx'. */
  ext: 'md' | 'mdx';
}

/** Full content graph emitted by ContentGraphEngine. */
export interface DocsGraph {
  /** All discovered pages in discovery order. */
  pages: DocPage[];
  /** Absolute path of the scope root (CWD at invocation time). */
  root: string;
}

/** A single nav tree node. */
export interface NavItem {
  label: string;
  /** Starlight entry-id URL path (used for sidebar link). */
  entryId?: string;
  /** Child items for directory nodes. */
  children?: NavItem[];
  /** Whether this item is a section index page. */
  isSectionIndex?: boolean;
}

/** Full hierarchical nav tree. */
export type NavTree = NavItem[];

/** fea-docs configuration (from config file or CLI flags). */
export interface FeaDocsConfig {
  /** Site name shown in the docs UI. */
  name?: string;
  /** Site title shown in the docs UI. */
  title?: string;
  /** Scope root override (default: process.cwd()). */
  root?: string;
  /** Base URL path for deployed docs (e.g. /my-repo). */
  base?: string;
  /** Additional ignore globs on top of defaults. */
  ignore?: string[];
  /** Framework adapters to enable. */
  frameworks?: FrameworkAdapter[];
  /** Alias import roots for component imports. */
  aliases?: Record<string, string>;
  /** Tailscale serve integration. */
  tailscaleServe?: boolean;
  /** Caffeinate (macOS sleep prevention). */
  caffeinate?: boolean;
  /** Explicit remote expose consent. */
  expose?: boolean;
  /** Obsidian-compatible vault publishing configuration. */
  obsidian?: ObsidianConfig;
}

export interface PublishDestinationConfig {
  repo: string;
  branch: string;
  path: string;
}

export interface PublishTargetConfig {
  label?: string;
  normalizedDocs?: PublishDestinationConfig;
  staticOutput?: PublishDestinationConfig;
}

/**
 * Per-feature toggles for Obsidian compatibility.
 * All features default to true when `obsidian.enabled` is true.
 * Set a feature to false to disable the corresponding normalization step.
 */
export interface ObsidianFeatures {
  /** Resolve `[[wikilinks]]` to standard Markdown links. Default: true. */
  wikilinks?: boolean;
  /** Expand `![[embeds]]` (note, heading, block, asset). Default: true. */
  embeds?: boolean;
  /** Normalize `> [!callout]` syntax to Starlight asides. Default: true. */
  callouts?: boolean;
  /** Generate and render backlink data. Default: true. */
  backlinks?: boolean;
  /** Emit `fea-docs.graph.json` for the graph view. Default: true. */
  graph?: boolean;
  /**
   * Require explicit target allowlisting via frontmatter `publish`.
   * When true (the default), nothing is public unless it names a configured target.
   * Set to false only if you want all pages to be public without explicit opt-in
   * (not recommended).
   */
  targetAllowlisting?: boolean;
}

export interface ObsidianConfig {
  /** Enable Obsidian-compatible vault normalization. Default: false. */
  enabled?: boolean;
  /**
   * Per-feature toggles. All features default to enabled when `obsidian.enabled` is true.
   */
  features?: ObsidianFeatures;
  /**
   * The default publishing target ID used when `--target` is not supplied to CLI commands.
   * Must match a key in `targets`.
   */
  selectedTarget?: string;
  /**
   * Paths relative to the source root that are always included as public assets
   * regardless of whether they are referenced by target-public pages.
   * E.g. `['assets/public']`
   */
  publicAssetDirs?: string[];
  /**
   * Additional glob patterns to ignore during discovery (on top of defaults and
   * the top-level `ignore` array).
   */
  ignorePaths?: string[];
  /** Fail on strict diagnostics. Overrides the top-level `strict` flag for Obsidian builds. */
  strict?: boolean;
  /** Publishing target definitions. */
  targets?: Record<string, PublishTargetConfig>;
}

/** Resolved, merged runtime config (all fields present). */
export interface ResolvedConfig {
  name?: string;
  title?: string;
  root: string;
  base: string;
  ignore: string[];
  port: number;
  open: boolean;
  strict: boolean;
  frameworks: FrameworkAdapter[];
  aliases: Record<string, string>;
  tailscaleServe: boolean;
  caffeinate: boolean;
  expose: boolean;
  obsidian?: ObsidianConfig;
}

/** Diagnostic emitted during validation. */
export interface Diagnostic {
  type: 'error' | 'warning';
  code: string;
  message: string;
  file?: string;
  line?: number;
}
