import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import type { DocPage, DocsGraph, ResolvedConfig } from '../types.js';
import { feaDocsWorkspaceCacheDir } from '../utils/cache-dir.js';
import { joinBasePath } from '../utils/base-path.js';

// Keep runtime content-loader discovery aligned with ContentGraphEngine:
// include hidden dot-prefixed files/dirs by default, then rely on
// .gitignore and user-configured ignore rules for exclusions.
export const CONTENT_GLOB_PATTERNS = [
  '**/*.{md,mdx}',
  '**/.*/**/*.{md,mdx}',
  '**/.*.{md,mdx}',
  '!**/node_modules/**',
];

export interface RuntimeAdapterOptions {
  config: ResolvedConfig;
  graph: DocsGraph;
}

/**
 * RuntimeAdapter materializes an ephemeral Starlight project,
 * symlinks source content, and manages the dev server lifecycle.
 */
export class RuntimeAdapter {
  private options: RuntimeAdapterOptions;
  private workdir: string;
  private devProcess: ChildProcess | null = null;

  constructor(options: RuntimeAdapterOptions) {
    this.options = options;
    this.workdir = feaDocsWorkspaceCacheDir(options.config.root);
  }

  /** Return path to the ephemeral Starlight project. */
  get projectDir(): string {
    return path.join(this.workdir, 'app');
  }

  /** Return workspace cache directory used by this runtime. */
  get runtimeDir(): string {
    return this.workdir;
  }

  /** Ensure the ephemeral project exists and is up to date. */
  async materialize(options?: { fresh?: boolean }): Promise<void> {
    fs.mkdirSync(this.projectDir, { recursive: true });
    await this.writePackageJson();
    await this.writeRemarkPlugin();
    await this.writeStripLeadH1Plugin();
    await this.writeAstroConfig();
    await this.writeContentLinks();
    await this.writeContentConfig();
    await this.installDeps({ clean: options?.fresh ?? true });
  }

  /** Ensure framework/runtime dependencies are installed for the current config. */
  async ensureDependencies(): Promise<void> {
    fs.mkdirSync(this.projectDir, { recursive: true });
    await this.writePackageJson();
    await this.installDeps({ clean: true });
  }

  private async writePackageJson(): Promise<void> {
    const pkg = {
      name: 'fea-docs-app',
      private: true,
      type: 'module',
      scripts: {
        dev: 'astro dev',
        build: 'astro build',
      },
      dependencies: {
        astro: '^6.3.5',
        '@astrojs/starlight': '^0.39.2',
        'unist-util-visit': '^5.1.0',
        'mdast-util-to-string': '^4.0.0',
        ...this.frameworkDeps(),
        ...this.options.config.dependencies,
      },
    };
    fs.writeFileSync(
      path.join(this.projectDir, 'package.json'),
      JSON.stringify(pkg, null, 2),
    );
  }

  private frameworkDeps(): Record<string, string> {
    const deps: Record<string, string> = {};
    for (const fw of this.options.config.frameworks) {
      if (fw === 'react') {
        deps['@astrojs/react'] = '^5.0.5';
        deps['react'] = '^19.0.0';
        deps['react-dom'] = '^19.0.0';
      } else if (fw === 'vue') {
        deps['@astrojs/vue'] = '^6.0.1';
        deps['vue'] = '^3.5.0';
      } else if (fw === 'svelte') {
        deps['@astrojs/svelte'] = '^8.1.1';
        deps['svelte'] = '^5.0.0';
      } else if (fw === 'solid') {
        deps['@astrojs/solid-js'] = '^6.0.1';
        deps['solid-js'] = '^1.9.0';
      } else if (fw === 'qwik') {
        deps['@qwikdev/astro'] = '^0.8.3';
        deps['@builder.io/qwik'] = '^1.19.2';
      }
    }
    return deps;
  }

  private async writeAstroConfig(): Promise<void> {
    const { config } = this.options;
    const title = this.resolveSiteTitle(config);

    const frameworkImports = config.frameworks
      .map((fw) => {
        const map: Record<string, string> = {
          react: `import react from '@astrojs/react';`,
          vue: `import vue from '@astrojs/vue';`,
          svelte: `import svelte from '@astrojs/svelte';`,
          solid: `import solidJs from '@astrojs/solid-js';`,
          qwik: `import qwikdev from '@qwikdev/astro';`,
        };
        return map[fw] ?? '';
      })
      .filter(Boolean)
      .join('\n');

    const frameworkIntegrations = config.frameworks
      .map((fw) => {
        const map: Record<string, string> = {
          react: 'react()',
          vue: 'vue()',
          svelte: 'svelte()',
          solid: 'solidJs()',
          qwik: 'qwikdev()',
        };
        return map[fw] ?? '';
      })
      .filter(Boolean)
      .join(', ');

    const aliasEntries = Object.entries(config.aliases)
      .map(([k, v]) => `'${k}': '${v}'`)
      .join(',\n    ');

    const astroConfig = `
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import remarkRewriteMdLinks from './remark-rewrite-md-links.mjs';
import remarkStripLeadH1 from './remark-strip-lead-h1.mjs';
${frameworkImports}

export default defineConfig({
  base: ${JSON.stringify(config.base)},
  integrations: [
    starlight({
      title: ${JSON.stringify(title)},
      sidebar: [
        { autogenerate: { directory: 'docs' } },
      ],
    }),
    ${frameworkIntegrations}
  ],
  markdown: {
    remarkPlugins: [remarkRewriteMdLinks, remarkStripLeadH1],
  },
  vite: {
    resolve: {
      ${aliasEntries ? `alias: {\n        ${aliasEntries}\n      },` : ''}
    },
    server: {
      fs: {
        allow: [${JSON.stringify(this.projectDir)}, ${JSON.stringify(this.options.config.root)}],
      },
      ${config.expose || config.tailscaleServe ? 'allowedHosts: true,' : ''}
    },
  },
  server: {
    port: ${config.port},
  },
});
`.trimStart();

    fs.writeFileSync(path.join(this.projectDir, 'astro.config.mjs'), astroConfig);
  }

  private resolveSiteTitle(config: ResolvedConfig): string {
    const explicitName = config.name?.trim();
    if (explicitName) return explicitName;

    const explicit = config.title?.trim();
    if (explicit) return explicit;

    const base = path.basename(path.resolve(config.root)).trim();
    if (!base) return 'Docs';

    const words = base
      .replace(/[-_]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1));

    return words.length > 0 ? words.join(' ') : 'Docs';
  }

  /**
   * Write a remark plugin that rewrites .md/.mdx links to their slug URLs
   * at render time. This runs inside Astro so it operates on the actual
   * source files via the symlink — no file copying needed.
   */
  private async writeRemarkPlugin(): Promise<void> {
    // Map relativePath → entryId URL (what Starlight actually serves).
    const slugMap = Object.fromEntries(
      this.options.graph.pages.map((p) => [p.relativePath.replace(/\\/g, '/'), p.entryId]),
    );
    // Astro 6 Content Layer resolves file paths through the symlink chain and
    // passes the full app-internal path to remark: e.g.
    //   <projectDir>/src/content/docs/docs/2-plan.md
    // We need to strip the app content dir prefix to get the slug-map key.
    // We also keep sourceRoot as a fallback for other Astro versions.
    const appContentDir = path
      .join(this.projectDir, 'src', 'content', 'docs')
      .replace(/\\/g, '/');
    const sourceRoot = this.options.config.root.replace(/\\/g, '/');
    const basePath = this.options.config.base;

    const plugin = `
import path from 'node:path';
import { visit } from 'unist-util-visit';

const slugMap = ${JSON.stringify(slugMap, null, 2)};
const appContentDir = ${JSON.stringify(appContentDir)};
const sourceRoot = ${JSON.stringify(sourceRoot)};
const basePath = ${JSON.stringify(basePath)};

function stripPrefix(absPath, prefix) {
  const p = absPath.replace(/\\\\/g, '/');
  if (p.startsWith(prefix + '/')) return p.slice(prefix.length + 1);
  return null;
}

export default function remarkRewriteMdLinks() {
  return (tree, file) => {
    const filePath = file.history?.[0] ?? '';
    const absPath = filePath.replace(/\\\\/g, '/');
    // Astro 6 passes the full app-internal path; try each prefix in order.
    const relPath =
      stripPrefix(absPath, appContentDir) ??
      stripPrefix(absPath, sourceRoot) ??
      path.posix.relative(sourceRoot, absPath);
    const sourceDir = path.posix.dirname(relPath);

    function splitUrl(url) {
      const match = url.match(/^([^?#]*)(.*)$/);
      return [match?.[1] ?? url, match?.[2] ?? ''];
    }

    function toBaseUrl(pathname) {
      const normalized = pathname.startsWith('/') ? pathname : '/' + pathname;
      if (basePath === '/') return normalized;
      return basePath + normalized;
    }

    function isExternalOrAbsolute(url) {
      return /^(?:[a-z][a-z0-9+.-]*:|\\/\\/|#|\\/)/i.test(url);
    }

    function resolveRelative(urlPath) {
      return path.posix.normalize(
        sourceDir === '.' ? urlPath : sourceDir + '/' + urlPath,
      );
    }

    function rewriteUrl(url) {
      if (!url || isExternalOrAbsolute(url)) return url;

      const [urlPath, suffix] = splitUrl(url);
      if (!urlPath) return url;

      if (/\\.mdx?$/i.test(urlPath)) {
        const resolved = resolveRelative(urlPath);
        const entryId = slugMap[resolved];
        if (entryId === undefined) return url;
        return toBaseUrl('/' + entryId + '/') + suffix;
      }

      const resolved = resolveRelative(urlPath);
      if (resolved === '..' || resolved.startsWith('../')) return url;
      return toBaseUrl('/' + resolved) + suffix;
    }

    const rewriteNodeUrl = (node) => {
      if (!node?.url) return;
      node.url = rewriteUrl(node.url);
    };

    visit(tree, 'link', rewriteNodeUrl);
    visit(tree, 'image', rewriteNodeUrl);
    visit(tree, 'definition', rewriteNodeUrl);
  };
}
`.trimStart();

    fs.writeFileSync(path.join(this.projectDir, 'remark-rewrite-md-links.mjs'), plugin);
  }

  /**
   * Write a remark plugin that removes a leading h1 when its text duplicates
   * the frontmatter title. Starlight already renders the frontmatter title as
   * a large h1 above the content, so the in-body h1 would be a visible dupe.
   *
   * Only the FIRST h1 is considered, and only when its plain-text content
   * (case-insensitively trimmed) matches the frontmatter title.
   */
  private async writeStripLeadH1Plugin(): Promise<void> {
    const plugin = `
import { toString } from 'mdast-util-to-string';

export default function remarkStripLeadH1() {
  return (tree, file) => {
    const title = file.data?.astro?.frontmatter?.title;
    if (!title) return;
    const normalised = String(title).trim().toLowerCase();

    const firstH1Idx = tree.children.findIndex(
      (node) => node.type === 'heading' && node.depth === 1,
    );
    if (firstH1Idx === -1) return;

    const h1 = tree.children[firstH1Idx];
    const text = toString(h1).trim().toLowerCase();
    if (text === normalised) {
      tree.children.splice(firstH1Idx, 1);
    }
  };
}
`.trimStart();

    fs.writeFileSync(path.join(this.projectDir, 'remark-strip-lead-h1.mjs'), plugin);
  }

  /**
   * Point src/content/docs at the configured source root.
   *
   * Runtime app artifacts are stored in a per-workspace user cache directory,
   * outside the source root. This allows a single directory-level symlink
   * without creating recursive cycles.
   */
  async writeContentLinks(): Promise<void> {
    const contentParent = path.join(this.projectDir, 'src', 'content');
    const contentDir = path.join(contentParent, 'docs');

    // Point src/content/docs at the full docs root.
    fs.rmSync(contentDir, { recursive: true, force: true });
    fs.mkdirSync(contentParent, { recursive: true });
    fs.symlinkSync(this.options.config.root, contentDir, 'dir');

    // Always write a redirect from / to the first content page.
    // A top-level README gets slug '' but Starlight serves it at /readme/,
    // not /, so we can never rely on Starlight to handle the root URL itself.
    this.writeIndexRedirect();
  }

  private writeIndexRedirect(pagesOverride?: DocPage[]): void {
    const pages = pagesOverride ?? this.options.graph.pages;
    // Prefer a top-level section index (README) as the landing page; fall back
    // to the first page in the set.
    const landingPage =
      pages.find((p) => p.isSectionIndex && !p.relativePath.includes('/')) ??
      pages[0];
    if (!landingPage) return;
    const target = joinBasePath(this.options.config.base, `/${landingPage.entryId}/`);
    const pagesDir = path.join(this.projectDir, 'src', 'pages');
    fs.mkdirSync(pagesDir, { recursive: true });
    fs.writeFileSync(
      path.join(pagesDir, 'index.astro'),
      `---\nconst response = Astro.redirect(${JSON.stringify(target)});\nreturn response;\n---\n`,
    );
  }

  /**
   * Write src/content.config.ts — Astro 6 Content Layer API.
   * Uses glob() loader pointing at src/content/docs (symlink to source root).
   * docsSchema() ensures Starlight's head/sidebar fields are initialised.
   * All source files are guaranteed to have a title by the time this runs
   * because parseDocFile injects one if missing during the scan phase.
   */
  private async writeContentConfig(pages?: DocPage[]): Promise<void> {
    const pattern = pages && pages.length > 0
      ? JSON.stringify(pages.map((p) => p.relativePath.replace(/\\/g, '/')), null, 6).replace(/\n/g, '\n      ')
      : JSON.stringify(CONTENT_GLOB_PATTERNS, null, 6).replace(/\n/g, '\n      ');
    const config = `\
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: glob({
      base: 'src/content/docs',
      pattern: ${pattern},
    }),
    schema: docsSchema(),
  }),
};
`;
    fs.writeFileSync(path.join(this.projectDir, 'src', 'content.config.ts'), config);
  }

  private async installDeps(options?: { clean?: boolean }): Promise<void> {
    const modulesDir = path.join(this.projectDir, 'node_modules');

    if (!options?.clean && fs.existsSync(modulesDir)) {
      return; // cache hit — node_modules is already valid
    }

    if (options?.clean) {
      const lockFile = path.join(this.projectDir, 'package-lock.json');
      if (fs.existsSync(lockFile)) fs.rmSync(lockFile);
      if (fs.existsSync(modulesDir)) fs.rmSync(modulesDir, { recursive: true });
    }

    execSync('npm install --loglevel=warn', {
      cwd: this.projectDir,
      stdio: 'pipe',
    });
  }

  /**
   * Create a filtered Astro project in an ephemeral directory with only
   * the specified pages available, then run a build.
   * The shared cache (runtimeDir) is never modified.
   * Returns the build output directory path.
   */
  async createFilteredBuild(
    pages: DocPage[],
    targetDir: string,
    config: ResolvedConfig,
  ): Promise<string> {
    const savedWorkdir = this.workdir;

    try {
      // Use the cache dir for the ephemeral project so Astro's compilation
      // cache behaves identically to the normal build. The targetDir is
      // only used for the output.
      this.workdir = feaDocsWorkspaceCacheDir(config.root);
      const buildOutDir = path.join(targetDir, 'dist');
      fs.mkdirSync(targetDir, { recursive: true });

      // Always clean the app dir to remove stale filtered content
      const appDir = this.projectDir;
      if (fs.existsSync(appDir)) {
        fs.rmSync(appDir, { recursive: true, force: true });
      }
      fs.mkdirSync(appDir, { recursive: true });

      await this.writePackageJson();
      await this.writeRemarkPlugin();
      await this.writeStripLeadH1Plugin();
      await this.writeAstroConfig();
      this.writeFilteredContentLinks(pages);
      await this.writeContentConfig(pages);
      await this.installDeps();

      await this.runBuild(buildOutDir);
      return buildOutDir;
    } finally {
      this.workdir = savedWorkdir;
    }
  }

  /** Symlink the full root so assets are available for the Code component.
   *  Content filtering is handled by writeContentConfig. */
  private writeFilteredContentLinks(pages: DocPage[]): void {
    const contentParent = path.join(this.projectDir, 'src', 'content');
    const contentDir = path.join(contentParent, 'docs');

    fs.rmSync(contentDir, { recursive: true, force: true });
    fs.mkdirSync(contentParent, { recursive: true });
    fs.symlinkSync(this.options.config.root, contentDir, 'dir');

    this.writeIndexRedirect(pages);
  }

  /** Start the Astro dev server. Returns the port it started on. */
  async startDev(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.devProcess = spawn(
        'node',
        ['node_modules/.bin/astro', 'dev', '--port', String(port)],
        {
          cwd: this.projectDir,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      const onData = (chunk: Buffer) => {
        const line = chunk.toString();
        process.stdout.write(line);
        const match = line.match(/localhost:(\d+)/);
        if (match) {
          resolve(Number(match[1]));
        }
      };

      this.devProcess.stdout?.on('data', onData);
      this.devProcess.stderr?.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk);
      });

      this.devProcess.on('error', reject);
      this.devProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Astro dev server exited with code ${code}`));
        }
      });
    });
  }

  /** Stop the dev server. */
  stopDev(): void {
    this.devProcess?.kill();
    this.devProcess = null;
  }

  /** Run Astro build. */
  async runBuild(outputDir: string): Promise<void> {
    execSync(
      `node node_modules/.bin/astro build --out-dir ${JSON.stringify(outputDir)}`,
      {
        cwd: this.projectDir,
        stdio: 'inherit',
      },
    );
  }
}
