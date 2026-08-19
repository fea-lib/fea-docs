---
title: "04 — Frontmatter box & title resolution"
---

# 04 — Frontmatter box & title resolution

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §4, §11

**What to build:** Frontmatter is never required. When present, it renders as a collapsed-by-default box (the structure from ticket 03), showing the raw block; its `title` value feeds the page `<title>` precedence chain (frontmatter `title` → first H1 → filename), and the raw-block display intentionally duplicates the title. Malformed frontmatter degrades gracefully: it renders as a plain code block instead of a parsed box, the page title falls back through the chain, and a warning is emitted.

**Blocked by:** 03 — Default theme & HTML shell

**Status:** ready-for-agent

- [ ] Files without frontmatter render normally
- [ ] Valid frontmatter renders as a collapsed-by-default box showing the raw block
- [ ] `title` participates in the `<title>` precedence: frontmatter `title` → first H1 → filename
- [ ] Malformed frontmatter renders as a plain code block (not a parsed box) and emits a warning
- [ ] Malformed frontmatter's page title falls back through the chain (H1 → filename)
- [ ] Frontmatter `title` duplication with the box is intended (no de-duplication required)