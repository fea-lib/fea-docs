---
title: "fea-docs v2 — Product Requirements"
---

# fea-docs v2 — Product Requirements

## 1. Purpose

`fea-docs` is a standalone build CLI that renders a directory of `.md`/`.mdx` files into a static, hostable HTML site with filename-driven, file-browser-style navigation. It replaces `fea-docs` v1 (the copy-in scaffold), `mdxpress`, and the Starlight-based docs app: a "simple solution" that requires no scaffolded app, no mandatory frontmatter, and no JavaScript for its core rendering and navigation.

This document states **constraints and requirements only**. Design/implementation decisions are deliberately excluded; choices already made are recorded as issues in the wayfinder map (`projects/fea-docs/map.md`).

## 2. Scope

### In scope

- A Node CLI, distributed via npm, with `dev` and `build` subcommands, run from the directory to be rendered.
- Rendering of `.md` and `.mdx` through one renderer surface.
- Static output deployable to any static host (incl. GitHub Pages) and usable in CI/CD (GitHub Actions, GitLab CI, or any runner).
- Progressive enhancement: core render + navigation work with JavaScript disabled.

### Out of scope (v1)

- Implementing the pre-v1 tool suites (`fea-docs` v1, `mdxpress`, Starlight) or migrating content from them.
- Multi-root aggregation — the tool renders the single execution directory only.
- Built-in shortcode/directive systems (charts, task-boards, etc. as syntax) — handled via custom components.
- Math/LaTeX and definition lists as rendering surface.

## 3. Rendering

### Surface

Required in v1:

- CommonMark core: headings, emphasis, lists, links, images, code spans/blocks, blockquotes.
- GFM tables with simple inline content in cells.
- Fenced code blocks with syntax highlighting baked in at build time (no JS needed to show highlighting).
- MDX: `import`/`export` statements, expressions (`{expr}`), and PascalCase component usage.
- Loose raw HTML passthrough for lowercase known-HTML tags, **attributes exactly as written** (e.g. `<table class="x">`).

The rendering rule for both `.md` and `.mdx` (a **per-file hybrid**, not a per-extension split):

- A file is compiled **as MDX when it uses MDX features** (an `import`/`export` statement, JSX, or an expression `{expr}`); otherwise it is processed as **plain markdown**.
- Either way, the output semantics are the same surface: **lowercase known-HTML tags** render as raw HTML passthrough; **PascalCase tags** are MDX/JSX components resolved from imports.
- The hybrid is what keeps `.md` able to include components (no artificial limitation) while building at near-plain-markdown speed for documents that don't actually use MDX features (MDX compilation is ~10× heavier per file than plain markdown).

Nice-to-have (not v1): footnotes, task lists, strikethrough/autolinks, mermaid-as-syntax, callouts/`:::` directives, multi-line block content in table cells, structured embeds beyond images.

### Trust model

**No sanitization** — content is trusted and rendered as written, matching the common static-generator norm (Jekyll/Hugo/11ty). Trust boundary: if content ever becomes untrusted (third-party ingest), stored-XSS and build-time MDX code execution become real risks requiring a sanitizer/ingest policy — a later concern, not a v1 feature.

## 4. Documents, frontmatter, titles

- **Frontmatter is never required.**
- If frontmatter is present:
  - It renders as a **collapsed-by-default box** showing the raw block (duplication with the page title, when `title` is present, is intended).
  - The `title` value is used for the page `<title>`; otherwise ignored by rendering.
- **Page `<title>` precedence:** frontmatter `title` → first H1 → filename.
- **Nav entry:** the filename.
- **Route:** the filename slug without the extension (`sub/foo.md` → `sub/foo.html`).
- **`index`/`README` are ordinary file entries** — no special routing or directory linkage. A directory's `index.md`/`README.md` is treated exactly like any other file; the same applies at the root (a root `index.md` and a directory `index.md` behave the same). `index` is never a directory's landing proxy, and at no level does it produce a directory nav link.

## 5. Navigation

- The site's navigation is a **file-browser tree** derived from the directory structure, using filenames as nav entries.
- **Ordering rules (deterministic):**
  1. Files first, directories second.
  2. `index` is always the first file within a group, if present.
  3. `README` is always the second file within a group, if present.
  4. All other files are ordered alphanumerically, with numbers before letters.
  5. Directories follow files, likewise ordered alphanumerically with numbers before letters.
- **`index` and `README` appear as ordinary file nav entries** — never merged into the directory node, never hidden. Every directory (and the root) is a **non-clickable expander**: its label toggles the group open/closed only and never navigates. A full-width row keeps it a good mobile touch target. No directory is ever a link to a page; there is no "directory landing page" concept at any level.
- **Default state:** all directories are collapsed **except the path to the currently rendered document** (its ancestors plus itself), which is open. This open-state for the current document is rendered server-side — no JS required.
- Mobile: the nav must be usable **without JS by default** (e.g. HTML/CSS disclosure), with JS used only when it adds clear UX value. One nav structure, repositioned responsively (implementation detail).
- Nav theme is responsive and works on mobile devices by default.

## 6. Routing, collisions, links, assets

- Routes mirror the tree: filename slug for files, relative to the dir (`sub/foo.md` → `sub/foo.html`).
- **Same-route collisions are resolved deterministically:** `.md` always precedes `.mdx` for the same slug, with informative CLI feedback recording how it was resolved. No file — including `index` and `README` — is special: each routes by its own filename slug and never as a directory landing page.
- **Cross-document links:** authors write natural source-relative links (`[x](sub/foo.md)`); the build rewrites `.md`/`.mdx` link targets to rendered routes.
- **Assets:** non-markdown assets referenced by documents are copied through to output untouched, so relative links resolve at deploy.
- **Component imports** resolve against the host project's `node_modules` and relative paths.

## 7. Progressive enhancement

- **Core** (rendering + navigation) works with JavaScript disabled.
- **Custom components** may be JavaScript-dependent — this is out of the tool's control.
- **Search** is JS-only (see §8).

## 8. Search

- Search is a **progressive enhancement**: a build-time search index plus a JS widget. The search box appears only when JavaScript is enabled; core render/navigation never requires it.
- **Indexed content:** filename + headings + frontmatter + full rendered text. (Requirement level: frontmatter is searchable when valid, excluded when malformed. Whether the index carries parsed field values, raw YAML, or both is implementation.)
- **Result navigation:** a result navigates to the **containing section heading** (`#<section>`) as the primary requirement; exact-text highlighting/landing is optional, to be added when feasible (an implementation decision).
- **Result presentation:** each hit shows page title + matching section heading + a snippet of the matched text + a link.
- **Ranking:** results are relevance-ordered (best match first); the exact scoring formula is implementation.
- **Index robustness:** the index is a static asset emitted at `build` (and `dev`), hosted with the site — no backend, no server; all query-time work happens in the browser. If a page is served without its index (misconfiguration only), the widget shows a small "search unavailable" message — no error noise, no console crash.
- **Performance promise:** must handle **1000+ documents** comfortably on a typical laptop (client-side query over the downloaded index). Exact build-time budgets are deferred to a scale smoke-test rather than specified here.
- **Nice-to-have (dev):** search functional on the **dev server**, not only on production builds (Starlight exposes search only on prod builds, likely for performance). This is desirable **if** the index/rebuild cost on `dev` is small enough — left to the scale smoke-test to judge.

## 9. CLI & configuration

### Commands

- `fea-docs dev` — serves the rendered site locally; watches the execution directory; automatically re-renders and reloads the browser on file save. Instant reload on save is the requirement (state-preserving HMR is not required).
- `fea-docs build` — emits static output, deployable anywhere.

Both run from the directory to be rendered.

### Options

- **Every option exists both as a CLI flag and as a config entry** — the option surface (`port`, `output`, `strict`, `base`, `theme`, `config` path) is expressible either way.
- **Precedence:** CLI flag > config file > built-in default.
- **Every option has a default value** — nothing is mandatory for the user; the specific default values are implementation detail, not product requirements.

### Configuration file

- Fixed name: `fea-docs.config.js` (JavaScript module), discovered in the **execution directory only** (no parent-directory scanning).
- **Zero-config default** — config is introduced only when a need forces it.
- Its first citizen is a **conditional `base` path** (per environment: local, dev, preview, prod) so the site can be deployed under a subpath (e.g. GitHub Pages project sites).

### Help & robustness

- `fea-docs --help` and a bare invocation print usage.
- Unknown subcommands or flags print an error plus usage and exit non-zero.

## 10. Theming

- Ships with a **default theme** that is responsive and works well on mobile by default.
- The theme is **light/dark capable**, with the preference read from the system.
- The theme is **overridable** via the `theme` option (both a CLI flag and a config entry, per §9), pointing at either a **local** or a **remote** theme.

## 11. Failsafe & error handling

Cross-cutting constraint: **every error-prone path has a deterministic, rule-based resolution plus informative CLI feedback** describing how it was resolved.

- **Default posture:** graceful + warn. `build` exits non-zero only on hard failures (e.g. read-only output, explicit-port-and-taken).
- **`--strict`** (available both as a flag and a config entry) promotes all warnings to failures.

Resolutions (each emits a warning; all are escalated by `--strict` unless noted):

| Situation | Resolution |
|---|---|
| Same-route `.md` + `.mdx` | `.md` wins; feedback reports the resolution |
| Broken internal link with text | Render struck-through; warning names the dangling target |
| Missing markdown media (image/video) | Broken-media fallback showing the alt text; warning names the dangling target |
| Broken/unresolvable component import | Import statement + every usage of its bindings render as visible fenced code blocks (statement-scoped, not executed); rest of file renders normally |
| Empty root / no renderable files | Warning; builds an empty nav / message page; exit 0 |
| Malformed frontmatter | Renders as plain code block (not a collapsed box), excluded from the search index; title falls back to H1 → filename |
| Non-UTF-8 / binary / oversized file | Skipped with warning; excluded from render and index |
| Dev port conflict, no port configured | Auto-increment to next free port; warning logs the used port |
| Dev port conflict, port explicitly configured | `dev` fails (explicit config must be honored) |
| Output dir conflict | Written like a normal build tool (write + remove prior files); no prompt |
| Read-only output | Hard failure, non-zero exit |
| Symlinks in the tree | All symlinks skipped in v1 (internal and external); each logged |
| Raw-HTML media (`<img>`/`<video>`/`<audio>`) | No dedicated failsafe — passes through as authored raw HTML (content trusted) |
| Two source assets → same output path | Logged rule-based resolution + warning |

## 12. CI/CD

- `fea-docs build` is **deterministic**: non-interactive, **no TTY or prompts required**, and emits a stable output artifact.
- The config's conditional `base` path supports deploy/CI environments (local/dev/preview/prod), not merely a single production flag.

## 13. Content conventions

- `.md` and `.mdx` share one renderer surface via the per-file hybrid — see §3.
- Ignore rules: the tool honors `.gitignore` in the execution context (root and any subdirectory) and always skips its own output directory.