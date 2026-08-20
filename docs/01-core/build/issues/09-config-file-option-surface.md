---
title: "09 — Config file & option surface"
---

# 09 — Config file & option surface

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §9

**What to build:** A config file, `fea-docs.config.js` (JavaScript module), discovered in the execution directory only (no parent-directory scanning). The tool is 0-config by default — config appears only when a need forces it. Every option exists both as a CLI flag and as a config entry (port, output, strict, base, theme, config path), with precedence CLI flag > config file > built-in default, and every option has a default value. The config's first citizen is a conditional `base` path (per environment: local/dev/preview/prod) so the site can be deployed under a subpath (e.g. GitHub Pages project sites).

**Blocked by:** 01 — CLI scaffold & build basics

**Status:** ready-for-agent

- [ ] `fea-docs.config.js` discovered in the execution directory only (no parent scanning)
- [ ] 0-config default — tool works with no config file present
- [ ] Every option expressible both as a CLI flag and a config entry (port, output, strict, base, theme, config path)
- [ ] Precedence: CLI flag > config file > built-in default
- [ ] Every option has a default value (nothing mandatory)
- [ ] Config supports a conditional `base` path, including a deploy/CI environment (local/dev/preview/prod)

## Requirements & constraints

**Config + option surface — PRD §9**
- Config file: **fixed name `fea-docs.config.js`** (a JavaScript module), discovered **in the execution directory only** (no parent-directory scanning).
- **0-config default** — config is introduced only when a need forces it; the tool must work with no config file present.
- **Every option exists both as a CLI flag and as a config entry** (port, output, strict, base, theme, config path).
- **Precedence: CLI flag > config file > built-in default.**
- **Every option has a default value** — nothing is mandatory for the user; specific default *values* are implementation detail (PRD §9). Defaults already live once per CONVENTIONS.md (build-options schema + constants).
- The config's **first citizen is a conditional `base` path** per environment (local/dev/preview/prod) so the site deploys under a subpath (e.g. GitHub Pages project sites) — this supports deploy/CI environments, not a single prod flag (PRD §9, §12).
- `--strict` (ticket 12), `--theme` (ticket 10), `--port` (ticket 08), `--output`, `--base` all surface through this machinery; `--config` itself is part of the option surface.
- Config is an **ESM module** — it executes at build time under the PRD §3 trust model (the build already runs content-as-code for MDX). It must stay non-interactive/deterministic (PRD §12). — it executes at build time under the PRD §3 trust model (the build already runs content-as-code for MDX). It must stay non-interactive/deterministic (PRD §12).

**Existing wiring to respect**
- Ticket 01 already parses/schema-verifies the flags (`build-options` schema); 09 adds the config source of truth **before** the merged options cross into commands — options must flow through `parseBuildOptions`-style schemas, never raw casts (CONVENTIONS.md).

## Open decisions

1. **Config export contract.** Does `fea-docs.config.js` export a **plain options object**, a **factory function (context given)** — e.g. receiving env map to compute the conditional `base` — or accept both? The conditional `base` per-environment needs a function-of-environment expression. *Rec:* default-export a JS object whose `base` may be a function taking the resolved build context / env name.
2. **Option surface breadth.** Which options are expressible in config *verbatim* (`port`, `output`, `strict`, `theme`), and does the `config` path option itself belong in the config file (self-reference oddity)? Decide the exact config schema mirroring the build-option schema + how JSON/YAML typing maps (config is JS, so types are runtime — need schema validation here too).
3. **Merge & precedence mechanics.** Where the config file is loaded and merged (configs → CLI → validated) while exporting defaults only once — pick module + parsing/validation point; the command actions must pass fully-resolved options, not re-apply defaults (CONVENTIONS.md).
4. **Conditional `base` semantics.** Define the environment set (local/dev/preview/prod — plus unknown), how the environment is named (flag `NODE_ENV`/`process.env` chain), and how `base` participates in **emitted URLs** — this determines page/asset URL prefixing (solve with ticket 07 decision 6) — decide the interaction surface now.
5. **Broken config file.** Unparsable/invalid/broken `fea-docs.config.js` → what policy? (Every error-prone path needs a deterministic rule + feedback — §11.) *Rec:* explicit build-time warning + ignored config (0-config posture), escalated by `--strict` (12), never a silent mid-render failure.
6. **CI determinism of config.** Config is JS and may read env/time/nondeterministic values; decide what could make output non-deterministic and whether the smoke test (13) should include config-bearing builds.