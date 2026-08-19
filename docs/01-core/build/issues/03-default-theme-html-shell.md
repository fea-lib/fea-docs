---
title: "03 — Default theme & HTML shell"
---

# 03 — Default theme & HTML shell

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §10

**What to build:** A default theme that is responsive and works well on mobile, delivered as an HTML/CSS contract later tickets build on. This ticket fixes the page shell, the navigation-tree markup, the collapse/expand mechanism (`<details>`/`<summary>`, JS-free by default), the frontmatter-toggle structure, and the base responsive styles. Everything that needs DOM/CSS (frontmatter box, nav expander, dev server's experienced UI) lands on this contract.

**Blocked by:** 02 — Core markdown rendering & routes

**Status:** ready-for-agent

- [ ] Default page shell defined (layout, content area, nav area)
- [ ] Navigation-tree markup defined as the single structure other tickets extend
- [ ] Collapse/expand implemented with JS-free HTML/CSS (`<details>`/`<summary>`) and usable on mobile
- [ ] Frontmatter-toggle structure (collapsed-by-default box) lands on a `<details>`-style disclosure
- [ ] Default styles are responsive and mobile-friendly out of the box
- [ ] No JavaScript required for rendering or navigation