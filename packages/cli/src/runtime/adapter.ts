import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import type { DocsGraph, ResolvedConfig } from '../types.js';
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
  async materialize(): Promise<void> {
    fs.mkdirSync(this.projectDir, { recursive: true });
    await this.writePackageJson();
    await this.writeRemarkPlugin();
    await this.writeStripLeadH1Plugin();
    await this.writeAstroConfig();
    await this.writeContentLinks();
    await this.writeContentConfig();
    if (this.graphEnabled()) {
      await this.writeGraphPage();
    }
    await this.installDeps();
  }

  /** Ensure framework/runtime dependencies are installed for the current config. */
  async ensureDependencies(): Promise<void> {
    fs.mkdirSync(this.projectDir, { recursive: true });
    await this.writePackageJson();
    await this.installDeps();
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
    const sidebarEntries = [
      "{ autogenerate: { directory: 'docs' } }",
      ...(this.graphEnabled()
        ? [`{ label: 'Knowledge Graph', link: ${JSON.stringify(joinBasePath(config.base, '/graph/'))} }`]
        : []),
    ];

    const astroConfig = `
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import remarkRewriteMdLinks from './remark-rewrite-md-links.mjs';
import remarkStripLeadH1 from './remark-strip-lead-h1.mjs';
${frameworkImports}

export default defineConfig({
  base: ${JSON.stringify(config.base)},
  publicDir: ${JSON.stringify(config.root)},
  integrations: [
    starlight({
      title: ${JSON.stringify(title)},
      sidebar: [
        ${sidebarEntries.join(',\n        ')},
      ],
    }),
    ${frameworkIntegrations}
  ],
  markdown: {
    remarkPlugins: [remarkRewriteMdLinks, remarkStripLeadH1],
  },
  vite: {
    resolve: {
      preserveSymlinks: true,
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

  private graphEnabled(): boolean {
    return this.options.config.obsidian?.features?.graph !== false;
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

  private writeIndexRedirect(): void {
    // Prefer a top-level section index (README) as the landing page; fall back
    // to the first page in the graph.
    const landingPage =
      this.options.graph.pages.find((p) => p.isSectionIndex && !p.relativePath.includes('/')) ??
      this.options.graph.pages[0];
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
  private async writeContentConfig(): Promise<void> {
    const pattern = JSON.stringify(CONTENT_GLOB_PATTERNS, null, 6).replace(/\n/g, '\n      ');
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

  /**
   * Write a built-in graph page at src/pages/graph.astro.
   *
   * If fea-docs.graph.json exists in the configured docs root, the graph data
   * is embedded inline so the page is fully static (no server fetch required).
   * If the file is absent the page renders an empty state message.
   *
   * The page is a standalone Astro page using the Starlight StarlightPage
   * component so it inherits the full site shell. It adds no weight to other
   * pages because the force-simulation script is scoped to this page only.
   */
  private async writeGraphPage(): Promise<void> {
    const graphJsonPath = path.join(this.options.config.root, 'fea-docs.graph.json');
    let graphJson: string;
    let hasData = false;

    if (fs.existsSync(graphJsonPath)) {
      try {
        const raw = fs.readFileSync(graphJsonPath, 'utf-8');
        // Validate it is parseable JSON before embedding.
        JSON.parse(raw);
        graphJson = raw;
        hasData = true;
      } catch {
        graphJson = '{"version":1,"targetId":"","nodes":[],"edges":[]}';
      }
    } else {
      graphJson = '{"version":1,"targetId":"","nodes":[],"edges":[]}';
    }

    const pagesDir = path.join(this.projectDir, 'src', 'pages');
    fs.mkdirSync(pagesDir, { recursive: true });

    // Build the non-visual fallback table rows from graph data for SSG.
    let fallbackRows = '';
    let fallbackEdgeRows = '';
    if (hasData) {
      try {
        const parsed = JSON.parse(graphJson) as {
          nodes: Array<{ id: string; title: string; route: string; tags?: string[] }>;
          edges: Array<{ source: string; target: string; type?: string }>;
        };
        fallbackRows = parsed.nodes
          .map((n) => {
            const href = this.escapeHtml(joinBasePath(this.options.config.base, n.route + '/'));
            const title = this.escapeHtml(n.title);
            const route = this.escapeHtml(n.route);
            const tags = this.escapeHtml((n.tags ?? []).join(', '));
            return '<tr><td><a href=' + JSON.stringify(href) + '>' + title + '</a></td><td><code>' + route + '</code></td><td>' + tags + '</td></tr>';
          })
          .join('\n          ');
        fallbackEdgeRows = parsed.edges
          .map((e) => {
            const src = this.escapeHtml(e.source);
            const tgt = this.escapeHtml(e.target);
            const typ = this.escapeHtml(e.type ?? '');
            return '<tr><td><code>' + src + '</code></td><td><code>' + tgt + '</code></td><td>' + typ + '</td></tr>';
          })
          .join('\n          ');
      } catch {
        // Silently fall back to empty rows on parse error.
      }
    }

    const noPagesFallback = '<tr>' + '<td colspan="3">No pages.</td>' + '</tr>';
    const noEdgesFallback = '<tr>' + '<td colspan="3">No connections.</td>' + '</tr>';
    const emptyStateMessage = hasData
      ? ''
      : '<p class="graph-empty">No graph data found. Run <code>fea-docs normalize --target &lt;target&gt;</code> first.</p>';

    // Build the page using string parts to avoid esbuild misinterpreting
    // component-tag-like text inside template literals as JSX.
    const frontmatter = [
      '---',
      "import StarlightPage from '@astrojs/starlight/components/StarlightPage.astro';",
      'const GRAPH_DATA = ' + graphJson + ';',
      '---',
    ].join('\n');

    const style = [
      '  <style>',
      '    #fea-graph-wrap { position: relative; width: 100%; }',
      '    #fea-graph-canvas {',
      '      display: block; width: 100%; height: 520px;',
      '      border: 1px solid var(--sl-color-gray-5, #e2e8f0);',
      '      border-radius: 0.5rem; background: var(--sl-color-bg, #fff); cursor: grab;',
      '    }',
      '    #fea-graph-canvas:active { cursor: grabbing; }',
      '    .graph-empty { color: var(--sl-color-gray-3, #94a3b8); font-style: italic; padding: 1rem 0; }',
      '    .fea-graph-fallback { margin-top: 2rem; }',
      '    .fea-graph-fallback summary { cursor: pointer; font-weight: 600; padding: 0.25rem 0; }',
      '    .fea-graph-fallback table { width: 100%; border-collapse: collapse; font-size: 0.875rem; margin-top: 0.75rem; }',
      '    .fea-graph-fallback th, .fea-graph-fallback td {',
      '      text-align: left; padding: 0.35rem 0.5rem;',
      '      border-bottom: 1px solid var(--sl-color-gray-6, #f1f5f9);',
      '    }',
      '    .fea-graph-fallback th { background: var(--sl-color-gray-7, #f8fafc); font-weight: 600; }',
      '  </style>',
    ].join('\n');

    const canvasEl = [
      '  ' + emptyStateMessage,
      '  <div id="fea-graph-wrap" aria-label="Knowledge graph visualisation" role="img">',
      '    <canvas id="fea-graph-canvas" tabindex="0"',
      '      aria-label="Force-directed knowledge graph. Use the table below for a non-visual list of pages and connections.">' +
        '</canvas>',
      '  </div>',
    ].join('\n');

    const fallbackSection = [
      '  <details class="fea-graph-fallback">',
      '    <summary>All pages and connections (table)</summary>',
      '    <h3>Pages</h3>',
      '    <table>',
      '      <thead><tr><th>Title</th><th>Route</th><th>Tags</th></tr></thead>',
      '      <tbody>',
      '        ' + (fallbackRows || noPagesFallback),
      '      </tbody>',
      '    </table>',
      '    <h3>Connections</h3>',
      '    <table>',
      '      <thead><tr><th>From</th><th>To</th><th>Type</th></tr></thead>',
      '      <tbody>',
      '        ' + (fallbackEdgeRows || noEdgesFallback),
      '      </tbody>',
      '    </table>',
      '  </details>',
    ].join('\n');

    // Inline client-side force simulation script.
    // Written as joined lines so esbuild does not misinterpret the JS content
    // (which references canvas/DOM APIs) as TypeScript source.
    const scriptLines = [
      '  <script is:inline define:vars={{ GRAPH_DATA }}>',
      '    (function () {',
      "      const canvas = document.getElementById('fea-graph-canvas');",
      '      if (!canvas) return;',
      "      const ctx = canvas.getContext('2d');",
      '      if (!ctx) return;',
      '      const nodes = (GRAPH_DATA.nodes || []).map((n) => ({',
      '        id: n.id, title: n.title, route: n.route,',
      '        x: Math.random() * 600 + 100, y: Math.random() * 400 + 60, vx: 0, vy: 0,',
      '      }));',
      '      const edges = (GRAPH_DATA.edges || []).map((e) => ({',
      '        source: nodes.findIndex((n) => n.id === e.source),',
      '        target: nodes.findIndex((n) => n.id === e.target),',
      "        type: e.type || '',",
      '      })).filter((e) => e.source >= 0 && e.target >= 0);',
      '      if (nodes.length === 0) return;',
      '      var K_REPEL=4000, K_SPRING=0.04, REST_LEN=120, K_CENTRE=0.006, DAMPING=0.88;',
      '      function tick() {',
      '        var cx=canvas.width/2, cy=canvas.height/2;',
      '        for (var i=0;i<nodes.length;i++) for (var j=i+1;j<nodes.length;j++) {',
      '          var dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y;',
      '          var dist=Math.sqrt(dx*dx+dy*dy)||1, force=K_REPEL/(dist*dist);',
      '          var fx=(dx/dist)*force, fy=(dy/dist)*force;',
      '          nodes[i].vx+=fx; nodes[i].vy+=fy; nodes[j].vx-=fx; nodes[j].vy-=fy;',
      '        }',
      '        for (var k=0;k<edges.length;k++) {',
      '          var s=nodes[edges[k].source], t=nodes[edges[k].target];',
      '          var ex=t.x-s.x, ey=t.y-s.y, ed=Math.sqrt(ex*ex+ey*ey)||1;',
      '          var stretch=ed-REST_LEN, efx=(ex/ed)*K_SPRING*stretch, efy=(ey/ed)*K_SPRING*stretch;',
      '          s.vx+=efx; s.vy+=efy; t.vx-=efx; t.vy-=efy;',
      '        }',
      '        for (var m=0;m<nodes.length;m++) {',
      '          nodes[m].vx+=(cx-nodes[m].x)*K_CENTRE; nodes[m].vy+=(cy-nodes[m].y)*K_CENTRE;',
      '          nodes[m].vx*=DAMPING; nodes[m].vy*=DAMPING;',
      '          nodes[m].x+=nodes[m].vx; nodes[m].y+=nodes[m].vy;',
      '        }',
      '      }',
      '      for (var ii=0;ii<120;ii++) tick();',
      '      var NODE_R=8;',
      "      function isDark() { return document.documentElement.getAttribute('data-theme')==='dark'; }",
      '      function colours() {',
      "        return isDark() ? {edge:'#4b5563',node:'#6366f1',nodeHover:'#a5b4fc',text:'#e5e7eb'}",
      "                        : {edge:'#cbd5e1',node:'#6366f1',nodeHover:'#4338ca',text:'#1e293b'};",
      '      }',
      '      function resizeCanvas() {',
      '        var rect=canvas.parentElement.getBoundingClientRect();',
      '        canvas.width=rect.width||800; canvas.height=520;',
      '      }',
      '      resizeCanvas();',
      '      window.addEventListener("resize", function() { resizeCanvas(); draw(); });',
      '      var hoveredNode=null, frameCount=0, rafId=null;',
      '      function draw() {',
      '        var c=colours();',
      '        ctx.clearRect(0,0,canvas.width,canvas.height);',
      '        ctx.strokeStyle=c.edge; ctx.lineWidth=1.5;',
      '        for (var p=0;p<edges.length;p++) {',
      '          ctx.beginPath();',
      '          ctx.moveTo(nodes[edges[p].source].x,nodes[edges[p].source].y);',
      '          ctx.lineTo(nodes[edges[p].target].x,nodes[edges[p].target].y);',
      '          ctx.stroke();',
      '        }',
      '        for (var q=0;q<nodes.length;q++) {',
      '          var nd=nodes[q], isHov=hoveredNode===nd;',
      '          ctx.beginPath(); ctx.arc(nd.x,nd.y,NODE_R+(isHov?3:0),0,Math.PI*2);',
      '          ctx.fillStyle=isHov?c.nodeHover:c.node; ctx.fill();',
      "          ctx.fillStyle=c.text; ctx.font='11px system-ui,sans-serif'; ctx.textAlign='center';",
      '          var lbl=nd.title.length>18?nd.title.slice(0,16)+"\u2026":nd.title;',
      '          ctx.fillText(lbl,nd.x,nd.y+NODE_R+13);',
      '        }',
      '      }',
      '      function animate() { tick(); draw(); frameCount++; if(frameCount<180) rafId=requestAnimationFrame(animate); }',
      '      animate();',
      '      function nodeAt(x,y) {',
      '        return nodes.find(function(n){var dx=n.x-x,dy=n.y-y;return Math.sqrt(dx*dx+dy*dy)<=NODE_R+4;})||null;',
      '      }',
      '      function getPos(ev) {',
      '        var r=canvas.getBoundingClientRect();',
      '        return {x:(ev.clientX-r.left)*(canvas.width/r.width),y:(ev.clientY-r.top)*(canvas.height/r.height)};',
      '      }',
      '      var dragging=null, dragOffset={x:0,y:0};',
      '      canvas.addEventListener("mousemove",function(ev){',
      '        var pos=getPos(ev);',
      '        if(dragging){dragging.x=pos.x-dragOffset.x;dragging.y=pos.y-dragOffset.y;dragging.vx=0;dragging.vy=0;if(rafId===null){frameCount=0;animate();}return;}',
      '        var hit=nodeAt(pos.x,pos.y);',
      '        if(hit!==hoveredNode){hoveredNode=hit;canvas.style.cursor=hit?"pointer":"grab";draw();}',
      '      });',
      '      canvas.addEventListener("mousedown",function(ev){',
      '        var pos=getPos(ev),hit=nodeAt(pos.x,pos.y);',
      '        if(hit){dragging=hit;dragOffset={x:pos.x-hit.x,y:pos.y-hit.y};}',
      '      });',
      '      window.addEventListener("mouseup",function(ev){',
      '        if(dragging){var pos=getPos(ev),hit=nodeAt(pos.x,pos.y);',
      "          if(hit===dragging&&Math.abs(dragOffset.x)<4&&Math.abs(dragOffset.y)<4){window.location.href=hit.route+'/';}",
      '          dragging=null;}',
      '      });',
      '      canvas.addEventListener("mouseleave",function(){if(!dragging){hoveredNode=null;draw();}});',
      '      var focusedNodeIdx=0;',
      '      canvas.addEventListener("keydown",function(ev){',
      '        if(nodes.length===0)return;',
      "        if(ev.key==='ArrowRight'){focusedNodeIdx=(focusedNodeIdx+1)%nodes.length;}",
      "        else if(ev.key==='ArrowLeft'){focusedNodeIdx=(focusedNodeIdx-1+nodes.length)%nodes.length;}",
      "        else if(ev.key==='Enter'){window.location.href=nodes[focusedNodeIdx].route+'/';return;}",
      '        else return;',
      '        ev.preventDefault();hoveredNode=nodes[focusedNodeIdx];draw();',
      '      });',
      '      canvas.addEventListener("focus",function(){if(nodes.length>0){hoveredNode=nodes[focusedNodeIdx];draw();}});',
      '      canvas.addEventListener("blur",function(){hoveredNode=null;draw();});',
      '      new MutationObserver(function(){draw();}).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});',
      '    })();',
      '  </script>',
    ].join('\n');

    const openTag = '<' + 'StarlightPage frontmatter={{ title: \'Knowledge Graph\', description: \'Visual overview of page relationships.\' }}>';
    const closeTag = '</' + 'StarlightPage>';

    const page = [
      frontmatter,
      openTag,
      style,
      canvasEl,
      fallbackSection,
      scriptLines,
      closeTag,
      '',
    ].join('\n');

    fs.writeFileSync(path.join(pagesDir, 'graph.astro'), page);
  }

  /** Escape a string for safe embedding in HTML attribute values and text. */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async installDeps(): Promise<void> {
    execSync('npm install --prefer-offline --loglevel=warn', {
      cwd: this.projectDir,
      stdio: 'pipe',
    });
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
