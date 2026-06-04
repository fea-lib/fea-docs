export const artifactFileNames = {
  manifest: 'fea-docs.manifest.json',
  diagnostics: 'fea-docs.diagnostics.json',
  graph: 'fea-docs.graph.json',
  backlinks: 'fea-docs.backlinks.json',
  search: 'fea-docs.search.json',
  publish: 'fea-docs.publish.json',
} as const;

export type ArtifactKind = keyof typeof artifactFileNames;
export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface SourceLocation {
  line?: number;
  column?: number;
}

export interface FeaDocsDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  sourcePath?: string;
  location?: SourceLocation;
  suggestion?: string;
}

export interface FeaDocsDiagnosticsFile {
  version: 1;
  generatedAt: string;
  diagnostics: FeaDocsDiagnostic[];
}

export interface FeaDocsHeading {
  level: number;
  text: string;
  anchor: string;
}

export interface FeaDocsManifestEntry {
  sourcePath: string;
  outputPath: string;
  route: string;
  title: string;
  format: 'md' | 'mdx';
  /** Global aliases declared in frontmatter for this page. */
  aliases?: string[];
  /** Explicit slug from frontmatter, overriding the filename-derived route segment. */
  slug?: string;
  /** Headings extracted from the page content. */
  headings?: FeaDocsHeading[];
  /** Explicit block IDs found in the page content (^block-id markers). */
  blockIds?: string[];
  /** Tags from frontmatter or inline content. */
  tags?: string[];
  /** Whether backlinks rendering is enabled for this page. */
  backlinks?: boolean;
  /** Whether this page is included in Pagefind search. */
  pagefind?: boolean;
  /** Title was derived from filename (no frontmatter title or H1 present). */
  titleFromFilename?: boolean;
}

export interface FeaDocsManifest {
  version: 1;
  targetId: string;
  generatedAt: string;
  pages: FeaDocsManifestEntry[];
  assets: string[];
  staticFiles: string[];
  generatedDataFiles: string[];
  diagnostics: {
    info: number;
    warnings: number;
    errors: number;
  };
}

export interface FeaDocsGraphNode {
  id: string;
  title: string;
  route: string;
  tags?: string[];
}

export interface FeaDocsGraphEdge {
  source: string;
  target: string;
  type?: 'markdown-link' | 'wikilink' | 'embed' | 'asset';
}

export interface FeaDocsGraph {
  version: 1;
  targetId: string;
  nodes: FeaDocsGraphNode[];
  edges: FeaDocsGraphEdge[];
}

export interface FeaDocsBacklinkEntry {
  sourceId: string;
  sourceTitle: string;
  sourceRoute: string;
  context?: string;
}

export interface FeaDocsBacklinks {
  version: 1;
  targetId: string;
  pages: Record<string, FeaDocsBacklinkEntry[]>;
}

export interface FeaDocsSearchEntry {
  pageId: string;
  route: string;
  included: boolean;
  reason?: string;
}

export interface FeaDocsSearchReport {
  version: 1;
  targetId: string;
  pages: FeaDocsSearchEntry[];
}

export interface FeaDocsPublishDestination {
  repo: string;
  branch: string;
  path: string;
}

/** Result of pushing one artifact directory to a git destination. */
export interface FeaDocsPublishedRef {
  destination: FeaDocsPublishDestination;
  /** Git commit SHA after a successful commit. Absent when skipped or failed. */
  sha?: string;
  /** True when the destination was already up-to-date and no commit was needed. */
  skipped: boolean;
  reason?: string;
}

export interface FeaDocsPublishSummary {
  version: 1;
  targetId: string;
  generatedAt: string;
  /** Configured destination for the normalized docs artifact. */
  normalizedDocs?: FeaDocsPublishDestination;
  /** Configured destination for the static output artifact. */
  staticOutput?: FeaDocsPublishDestination;
  /** Actual publication result for the normalized docs artifact. */
  normalizedDocsRef?: FeaDocsPublishedRef;
  /** Actual publication result for the static output artifact. */
  staticOutputRef?: FeaDocsPublishedRef;
  status: 'success' | 'failed';
  /** Per-step error message when status is 'failed'. */
  error?: string;
  diagnostics: FeaDocsDiagnostic[];
}
