---
title: "02 — Core markdown rendering & routes"
---

# 02 — Core markdown rendering & routes

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §3, §4, §5, §6

**What to build:** Plain CommonMark documents render to HTML pages that mirror the source tree. A file at `sub/foo.md` becomes a page at `sub/foo.html` (filename slug without the extension). All `.md`/`.mdx` files go through one renderer surface. Each page gets a basic HTML shell with a file-browser navigation tree, and a page `<title>` derived H1-first (falling back to the filename when there is no H1).

**Blocked by:** 01 — CLI scaffold & build basics

**Status:** ready-for-agent

- [ ] CommonMark core (headings, emphasis, lists, links, images, code spans/blocks, blockquotes) renders to HTML
- [ ] `sub/foo.md` → `sub/foo.html`; routes mirror the tree
- [ ] `.md` and `.mdx` share one renderer surface (per-file hybrid behavior lands in ticket 05)
- [ ] Each rendered page has a basic page shell and a file-browser navigation tree
- [ ] Page `<title>` precedence: first H1 → filename fallback

**Blocks:** 03 (shell), 05 (MDX hybrid), 07 (links/assets), 08 (dev server), 14 (static-render prototype) — the seams below must fit them or they rework the renderer.

## Requirements & constraints

The PRD is constraints-only; the checklist above is this ticket's slice. Sibling tickets own overlapping surface — respect the boundaries or their implementation regresses.

**Rendering surface — PRD §3**
- Compile **CommonMark core**: headings, emphasis, lists, links, images, code spans/blocks, blockquotes.
- `.md` and `.mdx` go through **one renderer surface**; in this ticket both take the plain-markdown path. The **per-file MDX hybrid** (a file compiles as MDX when it uses `import`/`export`, JSX, or `{expr}`) is **ticket 05**, as is the HTML-vs-JSX rule (lowercase known-HTML tags pass through as written; PascalCase = components).
- **Trust model: no sanitization** — content is trusted and rendered as written (PRD §3).
- v1-required **GFM tables** and **fenced-code syntax highlighting baked in at build time** (PRD §3) currently have **no owning ticket** — see Open decision 2.

**Documents, titles — PRD §4**
- Frontmatter is never required; frontmatter handling (collapsed box, malformed fallback) is **ticket 04**.
- `<title>` precedence implemented here: **first H1 → filename fallback**. The frontmatter `title` step sits above H1 and is inserted by **ticket 04** — title resolution must leave that slot open.
- Route mirroring: `sub/foo.md` → `sub/foo.html` (filename slug without the extension), relative to the execution dir.
- `index`/`README` are **ordinary file entries** — no special routing, no directory linkage, no landing-page semantics at any level (PRD §4).

**Navigation & shell — PRD §5, §7 (boundary with tickets 03/06)**
- Every page gets a basic HTML shell + a **file-browser navigation tree** whose entries are filenames (PRD §5).
- The definitive shell markup/responsive styles/collapse contract is **ticket 03**; ordering, expander-only directories, and current-path-open server-side state are **ticket 06**. 02 renders a *basic* shell and nav without finalizing the markup contract.
- **Core render + navigation must work with JavaScript disabled** (PRD §7).

**Routing, collisions, failsafes — PRD §6, §11**
- Routes mirror the tree (already derived by the content graph).
- Same-route `.md`/`.mdx` resolution (`.md` wins) plus feedback is **ticket 12** — do not permanently resolve collisions in 02 (see Open decision 6).
- Error-prone paths get deterministic rule-based resolution plus informative CLI feedback (PRD §11), graceful + warn by default.

**Determinism — PRD §12, build conventions**
- Non-interactive, deterministic output; `publishSite` and byte-order discovery already enforce this (per `CONVENTIONS.md`).

## Resolutions

Agreed in the grilling session (`@docs/01-core/build/issues/02-core-markdown-rendering-routes.md`). Each resolution is recorded before the next decision is taken.

- [x] **D1 — Markdown engine / compile stack.** **unified stack**: `remark-parse` + `remark-gfm` → `remark-rehype` (`allowDangerousHtml: true`) → `rehype-stringify` (`allowDangerousHtml: true`). Rationale: `@mdx-js/mdx` (ticket 05) is itself built on unified, so folding MDX in later shares one code path — the per-file hybrid becomes "MDX stage skipped" rather than two parallel renderers. Plugin APIs re-verified against current docs at implementation (provenance rule).
- [x] **D2 — Ownership of GFM tables + build-time syntax highlighting.** Both fold into **02** (both plain-markdown surface; no MDX involved). Tables via `remark-gfm` (a single plugin on the agreed stack). Highlighting via **`rehype-highlight`** (first-party, deterministic, no JS in output) on **lowlight `common`** (37 languages), landing at the rehype stage. Rich-but-rare `all` (192) grammars explicitly deferred.
- [x] **D3 — Renderer pipeline seams.** `src/render/` module with a **pipeline factory** `{ remarkPlugins, rehypePlugins }` → parse → transform → serialize. **Parse is the swap boundary** (02: both `.md`/`.mdx` use the remark chain; 05 replaces the parse stage for MDX-flagged files). Link rewriting (07) and heading ids (11) run on the **hast AST**, never final HTML. `allowDangerousHtml: true` at both wire points (raw passthrough trust model). **`firstH1(mdast)` is a separate helper** (04's shared title-resolution chain uses the same module). Shell emits only `EmittedFile` — 03 swaps the shell renderer without touching the pipeline.
- [x] **D4 — Heading anchors (part).** `github-slugger` wrapped in one slug module (`src/render/slugs.ts`); every consumer (heading ids here, 07 fragment rewriting, 11 index sections) goes through it — pass-through today, single extension point. Bare `id=""` edge cases **accepted as-is for now**. Additionally, `rehype-raw` makes literal raw-HTML headings traversable, so markdown *and* raw-HTML headings are id'd and feed first-H1. **Component-rendered headings** and the full slug-coverage question (which headings are covered/missed) are **revisited once the build-time render solution is established — dependent on `issues/14-mdx-static-render-minimal-js-prototype.md`** (see D3's seam: 05 re-scoped to React-backed MDX → static render → hydrate).
- [x] **D5 — Nav tree depth in 02.** **Derive a reusable tree data model** from the graph; render it simply. Confirmed shape: a faithful hierarchy of plain nodes `{ name, type: 'dir'|'file', children?, route, currentPath? }`, one module owns graph→tree derivation and gives the shell the tree. **A.** 02 renders a **basic `<ul>`/`<details>` nav** from this model — not the definitive markup contract. **B.** 03 owns the definitive shell/markup/expander; 06 owns ordering + open/current computation — 02 does **not** bake in either's contract. **C.** Future VS Code-style single-child-dir compaction is a **presentation-only pass** over the faithful tree (model stays faithful so 03/06's open/ordering computations retain hierarchy), applied after 06, deterministic, carrying current/open booleans through merged chains; exact separator/styling = 03's.
- [x] **D6 — Same-route collision interim.** **Keep last-wins + warn** in 02. Deterministic: the discovery is already byte-ordered (CONVENTIONS §12), so "last wins" over the sorted list is stable. 02 emits the warning into the **shared outbox** (`BuildResult.warnings`-shaped vector that ticket 12's record `{ kind, message, sourcePath }` standardizes; 04/05/07/08/09 emit into it too) so the collision warning is **already strict-escalatable** and 12 never re-tags it. The full `.md`-wins rule + `--strict` escalation stays in 12.
- [x] **D7 — `<title>` filename fallback granularity.** The fallback is the **full filename** — basename, case preserved, extension included (`foo/SUB.md` → nav `SUB.md`, title-fallback `SUB.md`). Matches PRD §4 "filename": nav entry and title fallback share the filename. Emitted through the same `escapeHtml` as every title, so `&`/`<`/`>` stems escape correctly. Frontmatter-`title` escaping stays 04's decision 5.
- [x] **D8 — Root `index.html` when no root `index` source.** The build finds the **start page** deterministically in nav order: from the root, take the first file per §6 ordering (root `index` → `README` → alphanumeric with numbers before letters); if the root has no direct files, descend to the first subdirectory (alphanumeric) and recurse. If no authored file produced an `index.html` route (no root `index.md` **or** `index.mdx`) **and** the root is non-empty, synthesize `index.html` that **immediately redirects to the start page** (`<meta http-equiv="refresh">` plus a no-JS-safe fallback link — works with JavaScript disabled). The synthesized page is **not a nav entry** and never shadows an authored root page (it fires only when the route is absent). The 01 empty-root message page stays.
- [x] **D9 — CommonMark conformance bar.** A **checked-in harness** runs the official CommonMark `spec.txt` suite (plus the GFM subsuite for the shipped GFM surface) through the renderer. Target: **≥95% pass** on the **strict CommonMark core** — the six shipped constructs. A **declared allowlist** lists the test IDs/spec-sections permitted to fail *intentionally*: **(a)** raw-HTML cases that CommonMark's sanitization-normalization contradicts our trust model (render exactly as written), **(b)** v1-out-of-scope constructs (footnotes, task lists, strikethrough, …). Any new failure **not** on the allowlist is a **regression**, not a renegotiation clause. The allowed-fail list is recorded and asserted, so the pass rate is a contract, not a number.

## Open decisions

Answer these before implementation and record the answers here.

1. **Markdown engine / compile stack.** unified (`remark-parse` → `remark-rehype` → `rehype-stringify`) — the natural fit for ticket 05's `@mdx-js/mdx`, deterministic, raw-HTML passthrough — vs `marked`, `markdown-it`, or raw `micromark`. *Recommendation:* unified stack; verify plugin APIs against current docs before committing (per `CONVENTIONS.md` provenance rule).
2. **Ownership of GFM tables + build-time syntax highlighting (PRD §3, unowned).** Fold into 02 (recommended: both are plain-markdown surface, no MDX involved), into 05, or a new ticket. Includes the highlighting library choice — baked at build, no JS.
3. **Renderer pipeline seams.** Choose the parse → transform → serialize shape so blocked tickets slot in without rework: 04 (frontmatter box + title chain), 05 (MDX compile swap), 07 (link/asset rewriting), 11 (heading anchors).
4. **Heading anchors (`id` slugs).** Search (§8) requires landing on the containing `#<section>` and no ticket owns it. Decide the slug algorithm, empty-slug fallback, and which headings are covered (markdown, literal raw-HTML, component-rendered) — resolve early: heading ids feed 07 (fragment rewriting) and 11 (index sections). **Resolution in Resolutions D4; slug-coverage revisit gated on ticket 14.**
5. **Nav tree depth in 02.** Derive a reusable tree data model from the graph and render it simply, leaving 03/06 to restyle/reorder (recommended), vs a minimal flat-list placeholder. (**Resolved — D5.**)
6. **Same-route collision interim.** Two pages writing the same route currently overwrite silently (last wins). Interim: keep last-wins with a warning (recommended) or add the `.md`-wins guard early; full resolution + `--strict` escalation stays in 12.
7. **`<title>` filename fallback granularity.** `sub/foo.md` → `"foo"` (basename stem; recommended, matches PRD §4 wording "filename") or `"sub/foo"` (route path).
8. **Landing page for a non-empty root without a root `index.md`.** Ticket 01 always emits `index.html`. Keep a root landing page (e.g. nav overview) or strictly mirror the tree (no landing)? PRD §4 calls root `index.md` ordinary; it is silent on a generated landing page.
9. **CommonMark conformance bar.** Run the official CommonMark spec suite through the renderer, at what target pass rate, and which constructs may fail? A checked-in conformance harness keeps fidelity from being renegotiated later.