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