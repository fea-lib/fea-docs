---
title: "10 — Theming system"
---

# 10 — Theming system

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §9, §10

**What to build:** On top of the default theme (ticket 03) and the config/option machinery (ticket 09), add the theming system: light/dark capability with the preference read from the system, and a `theme` option (both flag and config entry) that overrides the default by pointing at either a local or a remote theme. This changes appearance over the established DOM/CSS contract rather than the structure itself.

**Blocked by:** 03 — Default theme & HTML shell; 09 — Config file & option surface

**Status:** ready-for-agent

- [ ] Default theme is light/dark capable, preference read from the system
- [ ] `theme` option overrides to a local theme
- [ ] `theme` option overrides to a remote theme
- [ ] Theme override changes appearance over the existing DOM/CSS contract (structure unchanged)