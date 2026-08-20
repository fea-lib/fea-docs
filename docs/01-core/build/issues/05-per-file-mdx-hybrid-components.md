---
title: "05 — Per-file MDX hybrid & components"
---

# 05 — Per-file MDX hybrid & components

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §3, §11

**What to build:** Each `.md`/`.mdx` file is compiled as MDX only when it uses MDX features (an `import`/`export` statement, JSX, or an expression `{expr}`); otherwise it is processed as plain markdown — so `.md` can include components without paying MDX compile cost on plain files. Output semantics are one surface: lowercase known-HTML tags render as raw HTML passthrough (attributes as written); PascalCase tags are MDX/JSX components resolved from imports against the host project's `node_modules` and relative paths. An unresolvable import is rendered as visible fenced code blocks (the import statement itself and every usage of any binding from it — statement-scoped) and is not executed; the rest of the file renders normally and a warning is emitted.

**Blocked by:** 02 — Core markdown rendering & routes

**Status:** ready-for-agent

- [ ] Files with MDX features compile as MDX; files without them process as plain markdown (per-file hybrid)
- [ ] Lowercase known-HTML tags pass through as raw HTML, attributes exactly as written
- [ ] PascalCase tags resolve as components from host `node_modules` and relative paths
- [ ] A broken import renders as fenced code blocks — the import statement plus every usage of any of its bindings — and is not executed
- [ ] Rest of the file renders normally when one import is broken; a warning is emitted
- [ ] Import resolution failure produces a readable/actionable message

## Requirements & constraints

**Rendering surface — PRD §3**
- **Per-file hybrid**: a file compiles **as MDX when it uses MDX features** (an `import`/`export` statement, JSX, or an expression `{expr}`); otherwise it processes as **plain markdown**. `.md` and `.mdx` share the same surface (no per-extension split).
- Either way the semantics are **one surface**: **lowercase known-HTML tags** render as **raw HTML passthrough, attributes exactly as written**; **PascalCase tags** are **MDX/JSX components resolved from imports**.
- **Components resolve against the host project's `node_modules` and relative paths** (PRD §6, §3).
- The hybrid exists for **cost**: MDX compile is ~10× heavier per file than plain markdown; only files that actually use MDX features pay it (PRD §3). Detection must therefore be cheap.
- Custom components **may be JavaScript-dependent — out of the tool's control** (PRD §7).

**Trust model — PRD §3**
- Content is trusted, no sanitization — at build time, MDX imports and `{expr}` execute. That is the documented trust boundary (§3), not a feature to harden here.

**Failsafes — PRD §11**
- **Broken/unresolvable component import**: the import statement **plus every usage of its bindings** render as **visible fenced code blocks** (statement-scoped, not executed); the **rest of the file renders normally**; a warning is emitted; the message must be readable/actionable (ticket box).
- `--strict` (ticket 12) escalates this warning to a failure.

**Pipeline seam — with ticket 02**
- 05 slots into 02's renderer surface (ticket 02 decision 3): 02 establishes plain-markdown parse → transform → serialize; 05 swaps in the MDX compile path for MDX-flagged files and owns raw-HTML classification. Plain files must already pass raw HTML through so 05 only adds classification logic.

## Open decisions

1. **MDX compiler surface.** Choose the production compile path of `@mdx-js/mdx` on the unified stack (ticket 02 decision 1), which extensions/plugins (remark-gfm, syntax highlighting handoff), and when `{expr}` expressions are evaluated (build-time, trust model). Verify the integration against current docs per CONVENTIONS.md.
2. **Feature detection heuristic.** What counts as “uses MDX features” and how is it detected *cheaply*: regex/scan for `import`/`export`, JSX (`<Component`), `{expr}` — vs trying to parse as MDX and falling back. Edge cases must not misfire: `{expr}` inside fenced code or inline code, JSX-looking text in prose, `export` inside a code fence.
3. **Raw HTML/JSX classification boundary.** Lowercase known-HTML union: which tag set is a “known HTML tag”, and the inverse for “**PascalCase = component**” (uppercase-first letter, JSX composable). Attributes exactly as written through raw passthrough.
4. **Broken-import scope.** Statement-scoped substitution of the *specific bindings* used elsewhere — need a resolver that maps imports → bindings and rewrites each usage to a fenced code block; decide how `*`-imports (all bindings) and default/async-ish mentions are handled. This needs per-statement binding analysis.
5. **Warning plumbing.** Whether 05 emits warnings into a shared collection in ticket-12 style (shared warning outbox), and the exact text of the readable/actionable message (import source path, relative path, resolution hint).