import type { FeaDocsManifest } from '@fea-docs/schema';

export interface NormalizeOptions {
  sourceRoot: string;
  outputRoot: string;
  targetId: string;
  strict?: boolean;
}

export interface NormalizeResult {
  manifest: FeaDocsManifest;
}

export type Normalizer = (options: NormalizeOptions) => Promise<NormalizeResult>;
