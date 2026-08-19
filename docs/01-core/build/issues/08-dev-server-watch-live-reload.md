---
title: "08 — Dev server, watch & live reload"
---

# 08 — Dev server, watch & live reload

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §9, §11

**What to build:** `fea-docs dev` serves the rendered site locally, watches the execution directory, and automatically re-renders and reloads the browser on file save (instant reload on save is the requirement; state-preserving HMR is not). Port behavior: if no port is configured, the default auto-increments to the next free one with a warning logging the actually-used port; if a port is explicitly configured (flag or config) and it is taken, `dev` fails rather than silently falling back.

**Blocked by:** 02 — Core markdown rendering & routes

**Status:** ready-for-agent

- [ ] `fea-docs dev` serves the rendered site locally
- [ ] Watches the execution directory and re-renders on file save
- [ ] Browser reloads automatically on save (instant reload; HMR state preservation not required)
- [ ] Unconfigured port auto-increments to a free one; warning logs the used port
- [ ] Explicitly configured port that is taken → `dev` fails (no silent fallback)