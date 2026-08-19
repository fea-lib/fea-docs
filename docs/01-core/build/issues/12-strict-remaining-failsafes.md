---
title: "12 — `--strict` & remaining failsafes"
---

# 12 — `--strict` & remaining failsafes

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §11

**What to build:** The failsafe rulebook, plus the `--strict` mode that promotes every warning to a failure. Default posture is graceful + warn (build exits non-zero only on hard failures). Resolutions to land here: same-route `.md`-beats-`.mdx` collision with feedback; `--strict` available both as a flag and a config entry; read-only output is a hard failure; all symlinks in the tree are skipped (each logged); two source assets mapping to the same output path resolve with a logged rule + warning. Malformed-frontmatter, broken-import, and broken-link resolutions come from tickets 04/05/07 and are escalated by `--strict`.

**Blocked by:** 04 — Frontmatter box & title resolution; 05 — Per-file MDX hybrid & components; 07 — Links rewrite, assets & broken-media failsafe

**Status:** ready-for-agent

- [ ] `.md` beats `.mdx` on same-route collision, with informative feedback
- [ ] `--strict` promotes all warnings to failures; available as both flag and config entry
- [ ] Read-only output → hard failure, non-zero exit
- [ ] All symlinks skipped in v1 (each logged)
- [ ] Two assets mapping to the same output path → logged rule-based resolution + warning
- [ ] Warnings from tickets 04/05/07 are escalated by `--strict`