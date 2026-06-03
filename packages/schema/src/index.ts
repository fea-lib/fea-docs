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

export interface FeaDocsManifestEntry {
  sourcePath: string;
  outputPath: string;
  route: string;
  title: string;
  format: 'md' | 'mdx';
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

export interface FeaDocsPublishSummary {
  version: 1;
  targetId: string;
  generatedAt: string;
  normalizedDocs?: FeaDocsPublishDestination;
  staticOutput?: FeaDocsPublishDestination;
  status: 'success' | 'failed';
  diagnostics: FeaDocsDiagnostic[];
}
