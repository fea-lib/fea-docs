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