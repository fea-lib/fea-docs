---
title: "07 — Links rewrite, assets & broken-media failsafe"
---

# 07 — Links rewrite, assets & broken-media failsafe

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §6, §11

**What to build:** Authors write natural source-relative links (`[x](sub/foo.md)`); the build rewrites `.md`/`.mdx` link targets to rendered routes. Non-markdown assets referenced by documents are copied through to the output untouched so relative links resolve at deploy. Failsafes: a broken text link renders struck-through with a warning naming the dangling target; a missing markdown media asset (`![alt](url)`) renders the standard broken-media fallback showing the alt text with a warning. Raw-HTML media (`<img>`/`<video>`/`<audio>`) passes through as authored with no dedicated failsafe.

**Blocked by:** 02 — Core markdown rendering & routes

**Status:** ready-for-agent

- [ ] `.md`/`.mdx` cross-document links are rewritten from source-relative to rendered routes
- [ ] Non-markdown assets referenced by documents are copied through to output
- [ ] Broken text link renders struck-through; warning names the dangling target
- [ ] Missing markdown media renders broken-media fallback with the alt text; warning names the target
- [ ] Raw-HTML media passes through as authored (no special handling)

## Requirements & constraints

**Links & assets — PRD §6**
- Authors write **natural source-relative links** (`[x](sub/foo.md)`); the build **rewrites `.md`/`.mdx` link targets to rendered routes** (`sub/foo.md` → `sub/foo.html`).
- **Assets**: non-markdown assets referenced by documents are **copied through to the output untouched**, so relative links resolve at deploy.
- Component imports resolve against the host project's `node_modules` and relative paths (ticket 05).
- **Determinism**: rewrite and asset-copy must be deterministic and non-interactive (PRD §12).

**Failsafes — PRD §11**
- **Broken internal link with text**: renders **struck-through**; warning names the dangling target.
- **Missing markdown media** (`![alt](url)`): **broken-media fallback showing the alt text**; warning names the dangling target.
- **Raw-HTML media** (`<img>`/`<video>`/`<audio>`): **no dedicated failsafe — passes through as authored** (content trusted).
- **Two source assets → same output path**: logged rule-based resolution + warning (owned by **ticket 12**).
- `--strict` (ticket 12) escalates the broken-link/broken-media warnings.

**Pipeline seam (with 02)**
- Rewriting happens at the transform stage of 02's parse → transform → serialize pipeline; the link representation in the AST must be the seam (ticket 02 decision 3).

## Open decisions

1. **Which links get rewritten.** Only relative `.md`/`.mdx` text-link targets? What about fragment-only links to headings (`#…` — tied to the heading-slug contract from 02 decision 4), links with both `sub/foo.md#head`, absolute URLs (never touched), and `.md` targets inside raw-HTML `<a href>` (raw passthrough can't be rewritten) — define the rewrite set now.
2. **Anchor rewriting + slug dependency.** `foo.md#head` → `foo.html#<slug>` requires the heading-slug algorithm from ticket 02 to be stable first. Decide whether fragment rewriting is in scope for 07 or deferred until that contract settles.
3. **Asset collection model.** Does 07 copy only assets *referenced from documents* (AST walk over `href`/`src`/markdown images), or all non-markdown files wholesale? Related: do `.gitignore` rules apply to assets (the graph engine applies them to pages); symlink skip (ticket 01) and the output-directory / `node_modules` exclusions must hold for asset copy too.
4. **Broken-target definition.** A broken link = target source path doesn't exist (resolved against the root), vs target not among emitted routes. Since route/collision resolution lives in 12, decide the check base now (source-existence).
5. **Warning collection.** Whether struck-through/broken-media output records a warning once into a shared `BuildResult.warnings`-style vector so ticket 12's `--strict` escalation can aggregate — decide the shared vector now.
6. **Base-path interaction (with 09).** With a conditional `base` (ticket 09) set, every emitted `href`/`src` needs prefixing; decide whether 07's rewrite stage or the publisher (09) owns URL transformation. The wrong placement regresses links under a base path.