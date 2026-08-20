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

**Blocks:** 03 (shell), 05 (MDX hybrid), 07 (links/assets), 08 (dev server) — the seams below must fit them or they rework the renderer.

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

## Open decisions

Answer these before implementation and record the answers here.

1. **Markdown engine / compile stack.** unified (`remark-parse` → `remark-rehype` → `rehype-stringify`) — the natural fit for ticket 05's `@mdx-js/mdx`, deterministic, raw-HTML passthrough — vs `marked`, `markdown-it`, or raw `micromark`. *Recommendation:* unified stack; verify plugin APIs against current docs before committing (per `CONVENTIONS.md` provenance rule).
2. **Ownership of GFM tables + build-time syntax highlighting (PRD §3, unowned).** Fold into 02 (recommended: both are plain-markdown surface, no MDX involved), into 05, or a new ticket. Includes the highlighting library choice — baked at build, no JS.
3. **Renderer pipeline seams.** Choose the parse → transform → serialize shape so blocked tickets slot in without rework: 04 (frontmatter box + title chain), 05 (MDX compile swap), 07 (link/asset rewriting), 11 (heading anchors).
4. **Heading anchors (`id` slugs).** Search (§8) requires landing on the containing `#<section>` and no ticket owns it. Emit deterministic heading ids in 02 (recommended) or defer to 11.
5. **Nav tree depth in 02.** Derive a reusable tree data model from the graph and render it simply, leaving 03/06 to restyle/reorder (recommended), vs a minimal flat-list placeholder.
6. **Same-route collision interim.** Two pages writing the same route currently overwrite silently (last wins). Interim: keep last-wins with a warning (recommended) or add the `.md`-wins guard early; full resolution + `--strict` escalation stays in 12.
7. **`<title>` filename fallback granularity.** `sub/foo.md` → `"foo"` (basename stem; recommended, matches PRD §4 wording "filename") or `"sub/foo"` (route path).
8. **Landing page for a non-empty root without a root `index.md`.** Ticket 01 always emits `index.html`. Keep a root landing page (e.g. nav overview) or strictly mirror the tree (no landing)? PRD §4 calls root `index.md` ordinary; it is silent on a generated landing page.
9. **CommonMark conformance bar.** Run the official CommonMark spec suite through the renderer, at what target pass rate, and which constructs may fail? A checked-in conformance harness keeps fidelity from being renegotiated later.