---
title: "11 — Search index & widget"
---

# 11 — Search index & widget

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §7, §8

**What to build:** A build-time static search index covering filename + headings + valid frontmatter + full rendered text, emitted as a static asset with the site (no backend, no server). Search is JS-only: the search box appears only when JavaScript is enabled; core render/navigation never requires it. Results navigate to the containing section heading (`#<section>`), are relevance-ordered (best match first), and each hit shows page title + section heading + snippet + link. If the page is served without its index, the widget shows a small "search unavailable" message — no error noise, no console crash.

**Blocked by:** 04 — Frontmatter box & title resolution (valid-frontmatter indexing rides on frontmatter handling)

**Status:** ready-for-agent

- [ ] Static search index emitted at build covering filename + headings + valid frontmatter + full text
- [ ] Search box appears only when JavaScript is enabled; render/nav work without it
- [ ] Results navigate to the containing section heading (`#<section>`)
- [ ] Results are relevance-ordered; each shows title + section heading + snippet + link
- [ ] Missing index → "search unavailable" message, no error noise/console crash