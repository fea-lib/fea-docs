/** A single discovered documentation page. */
export interface DocPage {
  /** Absolute filesystem path to the source file. */
  absolutePath: string;
  /** Path relative to the content root (CWD or scope). */
  relativePath: string;
  /** Stable URL slug derived from the relative path. */
  slug: string;
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
  slug?: string;
  /** Child items for directory nodes. */
  children?: NavItem[];
  /** Whether this item is a section index page. */
  isSectionIndex?: boolean;
}

/** Full hierarchical nav tree. */
export type NavTree = NavItem[];

/** fea-docs configuration (from config file or CLI flags). */
export interface FeaDocsConfig {
  /** Scope root override (default: process.cwd()). */
  root?: string;
  /** Additional ignore globs on top of defaults. */
  ignore?: string[];
  /** Port to use for the dev server. */
  port?: number;
  /** Whether to open the browser automatically on start. */
  open?: boolean;
  /** Path to an explicit config file. */
  config?: string;
  /** Enable strict validation mode. */
  strict?: boolean;
  /** Slug overrides map: relativePath -> customSlug. */
  slugOverrides?: Record<string, string>;
  /** Framework adapters to enable. */
  frameworks?: Array<'react' | 'vue' | 'svelte' | 'solid'>;
  /** Alias import roots for component imports. */
  aliases?: Record<string, string>;
  /** Tailscale serve integration. */
  tailscaleServe?: boolean;
  /** Caffeinate (macOS sleep prevention). */
  caffeinate?: boolean;
  /** Explicit remote expose consent. */
  expose?: boolean;
}

/** Resolved, merged runtime config (all fields present). */
export interface ResolvedConfig {
  root: string;
  ignore: string[];
  port: number;
  open: boolean;
  strict: boolean;
  slugOverrides: Record<string, string>;
  frameworks: Array<'react' | 'vue' | 'svelte' | 'solid'>;
  aliases: Record<string, string>;
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
