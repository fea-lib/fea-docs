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
  /** Additional npm dependencies for custom MDX components. */
  dependencies?: Record<string, string>;
  /** Tailscale serve integration. */
  tailscaleServe?: boolean;
  /** Caffeinate (macOS sleep prevention). */
  caffeinate?: boolean;
  /** Explicit remote expose consent. */
  expose?: boolean;
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
  dependencies: Record<string, string>;
  tailscaleServe: boolean;
  caffeinate: boolean;
  expose: boolean;
}

/** Diagnostic emitted during validation. */
export interface Diagnostic {
  type: 'error' | 'warning';
  code: string;
  message: string;
  file?: string;
  line?: number;
}
