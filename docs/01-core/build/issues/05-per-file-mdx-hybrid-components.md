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