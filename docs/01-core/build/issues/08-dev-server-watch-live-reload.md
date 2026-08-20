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

## Requirements & constraints

**Dev server — PRD §9, §11**
- `fea-docs dev` **serves the rendered site locally**, **watches the execution directory**, and **automatically re-renders + reloads the browser on file save**. Instant reload on save is the requirement; state-preserving HMR is **not** required (PRD §9).
- Runs from the directory to be rendered (PRD §9) — same content-graph/ignore semantics as `build` (ticket 01).
- **Port behavior (PRD §11):**
  - no port configured → default **auto-increments to the next free port**, warning logs the actually-used port;
  - **explicitly configured port** (flag *or* config) that is taken → **`dev` fails** (explicit config must be honored; no silent fallback).
- Port is an option on both the CLI and config surfaces (ticket 09; precedence flag > config > default).
- **Search on `dev`** is a §8 nice-to-have, gated by ticket 13's scale smoke-test — not a v1 requirement here.
- `--strict` does not change port semantics; the port conflict rules are hard-vs-explicit by design (§11).

## Open decisions

1. **Serving mechanics.** Node `node:http` static file server vs a mounted framework — and whether it serves the **emitted `dist/`-style output** (reuse `publishSite` + `node:http`) or a live in-memory render path. *Rec:* serve emitted files on `node:http`; avoids two output models and keeps dev output identical to build.
2. **Watch mechanism.** Filesystem-watch library (e.g. chokidar / `fsnotifier`-style) vs a polling loop. Determinism unaffected, but cost + TTY-less operation matter. *Rec:* a watcher over the root honoring the same ignore/`.gitignore` rules as the build graph, so `.git`/`node_modules`/output-dir saves don't trigger rebuilds.
3. **Reload push.** How the browser auto-reloads: in-page JS that polls a change endpoint, an SSE/long-poll channel, or a `file://`+`location.reload` trick in a dev server page. Core must stay JS-free, but the dev reload is a *dev-only* enhancement. Decide the mechanism + where the reload-only script is injected (dev-server-only shell hook, never in `build` output).
4. **Rebuild scope & debounce.** Full re-render of the site on any save (build-from-scratch like `build`) vs grained rebuild of changed pages + assets. `dev` needs it fast (file saving → reload) but deterministic — decide emit-on-save strategy and whether save storms debounce.
5. **Config/CLI wiring.** Where `dev` reads `--port` from the unified option merged source of ticket 09, and how "explicit vs default" is distinguishable post-merge (needed for the two port branches). CLI defaults must not accidentally mean "explicit".