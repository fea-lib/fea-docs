/**
 * Default technical directories/files to exclude from discovery.
 * These are always ignored regardless of user configuration.
 */
export const DEFAULT_IGNORE_GLOBS: string[] = [
  // Dependency directories
  '**/node_modules/**',
  '**/.pnp/**',
  // Build outputs
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.output/**',
  // Coverage and test outputs
  '**/coverage/**',
  '**/.nyc_output/**',
  // Version control
  '**/.git/**',
  // Hidden directories (must be ignored consistently across all processing)
  '**/.*/**',
  // Package manager artifacts
  '**/.yarn/**',
  '**/.pnpm-store/**',
  // Editor/IDE
  '**/.idea/**',
  '**/.vscode/**',
  // OS artifacts
  '**/.DS_Store',
  '**/Thumbs.db',
  // Temporary files
  '**/tmp/**',
  '**/temp/**',
  '**/.temp/**',
  '**/.tmp/**',
  // Log files
  '**/*.log',
  '**/logs/**',
  // Cache directories
  '**/.cache/**',
  '**/.turbo/**',
  '**/.astro/**',
  // fea-docs workdir (must never be scanned)
  '**/.fea-docs/**',
];
