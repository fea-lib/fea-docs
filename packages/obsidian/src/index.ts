import type { SyntaxHandler } from '@fea-docs/syntax-engine';

export interface ObsidianHandlersOptions {
  callouts?: boolean;
  embeds?: boolean;
  wikilinks?: boolean;
}

export function createObsidianHandlers(_options: ObsidianHandlersOptions = {}): SyntaxHandler[] {
  return [];
}
