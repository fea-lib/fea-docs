import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { artifactFileNames, countDiagnostics, type FeaDocsDiagnostic, type FeaDocsDiagnosticsFile } from '@fea-docs/schema';

export function diagnosticsFile(diagnostics: FeaDocsDiagnostic[]): FeaDocsDiagnosticsFile {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    diagnostics,
  };
}

export function writeDiagnosticsFile(outputRoot: string, diagnostics: FeaDocsDiagnostic[]): void {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(
    path.join(outputRoot, artifactFileNames.diagnostics),
    `${JSON.stringify(diagnosticsFile(diagnostics), null, 2)}\n`,
  );
}

export function printDiagnosticSummary(diagnostics: FeaDocsDiagnostic[]): void {
  const counts = countDiagnostics(diagnostics);
  const warnings = counts.warnings === 1 ? '1 warning' : `${counts.warnings} warnings`;
  const errors = counts.errors === 1 ? '1 error' : `${counts.errors} errors`;
  const info = counts.info === 1 ? '1 info' : `${counts.info} info`;
  const summary = `Diagnostics summary: ${errors}, ${warnings}, ${info}.`;

  if (counts.errors > 0) {
    console.log(pc.red(summary));
  } else if (counts.warnings > 0) {
    console.log(pc.yellow(summary));
  } else {
    console.log(pc.green(summary));
  }
}

export function buildDiagnostic(params: {
  code: string;
  message: string;
  sourcePath?: string;
  suggestion?: string;
}): FeaDocsDiagnostic {
  return {
    code: params.code,
    severity: 'error',
    message: params.message,
    ...(params.sourcePath ? { sourcePath: params.sourcePath } : {}),
    ...(params.suggestion ? { suggestion: params.suggestion } : {}),
  };
}
