import type { FeaDocsDiagnostic } from '@fea-docs/schema';

export interface SyntaxDocument {
  path: string;
  content: string;
  format: 'md' | 'mdx';
}

export interface SyntaxTransformResult {
  content: string;
  format: 'md' | 'mdx';
  diagnostics: FeaDocsDiagnostic[];
}

export interface SyntaxHandler {
  name: string;
  transform(document: SyntaxDocument): SyntaxTransformResult | Promise<SyntaxTransformResult>;
}

export interface SyntaxEngine {
  handlers: SyntaxHandler[];
}

export function createSyntaxEngine(handlers: SyntaxHandler[] = []): SyntaxEngine {
  return { handlers };
}
