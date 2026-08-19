---
title: "fea-docs v2 — Static MDX Site Renderer (PRD)"
labels: wayfinder:map
---

## Destination

A **PRD** for **fea-docs v2** — a concise, compact document of *constraints and requirements only*, describing a standalone build CLI that renders `.md`/`.mdx` files from one directory into a static, no-JS-required-for-core HTML site with filename-driven file-browser navigation. Design/implementation decisions are deliberately absent from the PRD; any that surface get logged as issues, not PRD content.

## Notes

- **Deliverable is a PRD**, not a design or build. Wayfinder "plans, doesn't do": tickets resolve *requirement* decisions; the PRD assembly is the terminal handoff.
- **No design/implementation decisions in the PRD.** When sessions touch implementation (engine choice, dev-server mechanics, theme internals), log them as issues without committing to them in the PRD.
- **`fea-docs v2` replaces `fea-docs` v1 (copy-in scaffold) and supersedes `mdxpress` / Starlight.** v1/mdxpress/Starlight blueprints are **not consulted** in this effort.
- **Established requirements (settled during charting — will flow into the PRD):**
  - Standalone Node CLI (npm-distributed, `dev`/`build`), run from the directory to render. No scaffolded app, no framework to own.
  - Single-root, mirror-the-tree: renders one root directory recursively into a static `dist/`; includes ignore rules (honor `.gitignore` at root + subdirs; always skip tool's own output dir, `node_modules`, `.git`).
  - `.md` and `.mdx` share one renderer surface, resolved by a **per-file hybrid**: MDX when the file uses MDX features (imports/JSX/exprs), else plain markdown — so `.md` can use components without paying MDX (~10×) cost on plain files.
  - **No frontmatter required.** If present, rendered as a collapsed-by-default box; only `title` is used (title precedence: frontmatter.title → first H1 → filename).
  - **Nav = file-browser tree** from directory structure, filename-driven. Ordering: files first, dirs second; `index` first within a group, `README` second; then alphanumeric, numbers before letters (same rule for dirs). `index`/`README` are **ordinary child file entries**; directories (and their labels) are clickable **only to expand/collapse** — no directory is ever a page link, no directory landing page concept.
  - Routes = filename slug (no extension); no file is special — `index`/`README` route by their own slug like any file. Same-route collision: `.md` precedes `.mdx`, resolved automatically with informative CLI feedback.
  - **Progressive enhancement as a hard constraint:** core (render + navigation) works with JavaScript disabled. Search is a build-time-index + JS-widget enhancement; the search box appears only when JS is on. Custom components may be JS-dependent — out of the tool's control.
  - **Custom/3rd-party components:** imports resolve against the host project's `node_modules` and relative paths; unresolvable imports fail with a readable message.
  - **Assets & links:** non-markdown assets copy through untouched; `.md`/`.mdx` cross-links rewrite to rendered routes.
  - **Dev:** `dev` watches the execution directory; re-renders + reloads the browser on save (instant reload is enough — true HMR not required). Default port, configurable via config file and CLI. Precedence: CLI > config > default.
  - **Config: 0-config default.** Introduced only when forced. Minimum: a JS config file allowing a conditional `base` path (local/dev/prod).
  - **Theme:** ships a responsive, mobile-friendly default; light/dark capable, preference read from the system; overridable via config to a local or remote theme.
  - **Failsafe constraint:** every error-prone path has a deterministic rule-based resolution plus informative CLI feedback describing how it was resolved.
  - **CI/CD-runnable:** `fea-docs` must run headlessly in CI/CD (GitHub Actions, GitLab CI, or any runner) — a deterministic `build` that runs non-interactively, exits with a meaningful code, and emits a stable output artifact. No TTY/prompts required.
  - **Nav default state:** by default every directory in the nav tree is closed, except the path to the currently rendered document (its ancestors plus itself). The open state for the current document is rendered server-side — no JS required.
- Skills to consult: wayfinder (default), grilling for HITL tickets, to-spec for the terminal PRD assembly.

## Decisions so far

- [Rendering Fidelity Scope](issues/01-rendering-fidelity-scope.md) — **v1 required:** CommonMark core, simple GFM tables, fenced code with build-time syntax highlighting, MDX (imports/exports/exprs/PascalCase components). **HTML-vs-JSX rule:** lowercase known-HTML tags = raw HTML passthrough (attrs as written); PascalCase = MDX/JSX component. **Per-file hybrid:** a file compiles as MDX only when it uses MDX features, else plain markdown (~10× cheaper), so `.md` can use components without per-file MDX cost. **Trust model:** no sanitization, content trusted. Nice-to-have: footnotes, task lists, strikethrough, mermaid, callouts, block-in-cells, embeds. Out of scope v1: math/LaTeX, definition lists. See ticket for full detail.
- [Search Indexing & Result Requirements](issues/02-search-indexing-and-results.md) — Indexes **filename + headings + frontmatter + full text**. **Section-anchor navigation** (land on containing `#heading`) is the v1 requirement; exact-text highlight optional/nice-to-have (implementation decision). Results show title + section heading + snippet + link; relevance-ordered; static index emitted at build, JS-only, "search unavailable" fallback. Comfortable at 1000+ docs. See ticket for full detail.
- [Error-Path Rulebook](issues/03-error-path-rulebook.md) — **Graceful + warn by default; `--strict` (flag + config) promotes warnings to failures.** `.md` wins same-stem collisions; broken imports render as visible code blocks (statement-scoped); broken links render **struck-through**; dirs are expander-only (never page links; `index`/`README` are ordinary file entries); malformed frontmatter degrades to code block + skips index + title falls back; non-UTF-8/oversized skipped; **port: implicit-default-increments, explicit-config-fails**; symlinks all skipped; asset conflicts resolve with logged rule + warn. See ticket for full detail.
- [CLI & Config Surface Requirements](issues/04-cli-config-surface.md) — `dev`/`build`; **every option is both a flag and a config key** (`--port`, `--output`, `--strict`, `--base`, `--theme`, `--config`); precedence **flag > config > default**, and every option has a default (values = implementation detail); config = fixed `fea-docs.config.js` (ESM) in execution dir only, how conditional `base` is expressed; 0-config default; `--help`/usage + non-zero on unknown input; `build` non-interactive/CI-safe. See ticket for full detail.
- [Assemble the fea-docs v2 PRD](issues/05-assemble-prd.md) — **Destination reached.** PRD finalised at `projects/fea-docs/01-core/prd/prd.md` (13 sections; constraints/requirements only; reviewed + iterated incl. a second-model pass). Composes the established requirements (map Notes) with tickets 01–04.

## Not yet specified

- **Scale & performance expectations** — how large a tree must render fast (thousands of files? build-time ceiling?), and whether the PRD promises any performance guarantee. Likely graduates into a ticket once the CLI/config surface (04) settles.
- **PRD document shape** — section layout and length budget for the PRD itself; sharpens once the requirement tickets land.
- **Search UX beyond the JS-only widget** — snippet/highlight behaviour, result presentation bar beyond the requirements in ticket 02. Possible prototype later, after 02.

## Out of scope

<!-- work consciously ruled beyond the destination; closed, never graduates -->

- **Implementing fea-docs v2 itself** — this map produces the PRD; the build is the handoff afterward.
- **Migrating/supporting fea-docs v1, mdxpress, or Starlight** — they are being replaced, not maintained here.
- **Consulting the fea-docs v1 / mdxpress / Starlight blueprints** — deliberately not read during this effort.
- **Multi-root aggregation** — the tool renders the single execution directory only.