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
  /**
   * Run all registered handlers in registration order.
   * Each handler receives the output document from the previous handler.
   * Diagnostics from all handlers are accumulated in the final result.
   */
  transform(document: SyntaxDocument): Promise<SyntaxTransformResult>;
}

export function createSyntaxEngine(handlers: SyntaxHandler[] = []): SyntaxEngine {
  return {
    handlers,
    async transform(document: SyntaxDocument): Promise<SyntaxTransformResult> {
      const allDiagnostics: FeaDocsDiagnostic[] = [];
      let current: SyntaxDocument = { ...document };

      for (const handler of handlers) {
        const result = await handler.transform(current);
        allDiagnostics.push(...result.diagnostics);
        current = {
          path: current.path,
          content: result.content,
          format: result.format,
        };
      }

      return {
        content: current.content,
        format: current.format,
        diagnostics: allDiagnostics,
      };
    },
  };
}
