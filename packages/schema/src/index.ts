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

export interface FeaDocsArtifactSchema {
  artifact: ArtifactKind;
  version: 1;
  required: string[];
}

export const artifactSchemas = {
  diagnostics: {
    artifact: 'diagnostics',
    version: 1,
    required: ['version', 'generatedAt', 'diagnostics'],
  },
  manifest: {
    artifact: 'manifest',
    version: 1,
    required: ['version', 'targetId', 'generatedAt', 'pages', 'assets', 'staticFiles', 'generatedDataFiles', 'diagnostics'],
  },
  graph: {
    artifact: 'graph',
    version: 1,
    required: ['version', 'targetId', 'nodes', 'edges'],
  },
  backlinks: {
    artifact: 'backlinks',
    version: 1,
    required: ['version', 'targetId', 'pages'],
  },
  search: {
    artifact: 'search',
    version: 1,
    required: ['version', 'targetId', 'pages'],
  },
  publish: {
    artifact: 'publish',
    version: 1,
    required: ['version', 'targetId', 'generatedAt', 'status', 'diagnostics'],
  },
} as const satisfies Record<ArtifactKind, FeaDocsArtifactSchema>;

export function countDiagnostics(diagnostics: FeaDocsDiagnostic[]): FeaDocsManifest['diagnostics'] {
  return {
    info: diagnostics.filter((d) => d.severity === 'info').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    errors: diagnostics.filter((d) => d.severity === 'error').length,
  };
}

export function isFeaDocsDiagnostic(value: unknown): value is FeaDocsDiagnostic {
  if (!value || typeof value !== 'object') return false;
  const diagnostic = value as Record<string, unknown>;
  return (
    typeof diagnostic.code === 'string'
    && (diagnostic.severity === 'info' || diagnostic.severity === 'warning' || diagnostic.severity === 'error')
    && typeof diagnostic.message === 'string'
    && (diagnostic.sourcePath === undefined || typeof diagnostic.sourcePath === 'string')
    && (diagnostic.suggestion === undefined || typeof diagnostic.suggestion === 'string')
  );
}

export function isFeaDocsDiagnosticsFile(value: unknown): value is FeaDocsDiagnosticsFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Record<string, unknown>;
  return file.version === 1 && typeof file.generatedAt === 'string' && Array.isArray(file.diagnostics) && file.diagnostics.every(isFeaDocsDiagnostic);
}
