---
title: "CLI & Config Surface Requirements"
labels: wayfinder:grilling
---

Type: grilling
Status: resolved
Blocked by:

## Question

Settle the exact command/config surface the PRD promises so the tool's contract is fixed without pinning implementation.

Currently established: `dev` (watch + reload), `build` (static output), run from the directory to render; **0-config default**; a **JS config file** exists to allow a **conditional `base` path** (local/dev/prod); port configurable with precedence **CLI > config > default**.

Still to decide as requirements:

- **Commands & flags:** exactly what `dev`/`build` accept. Is there `--port`? `--config <path>`? `--output`? `--watch` implied by `dev`? Anything else in v1?
- **Config file discovery/naming:** fixed filename (`fea-docs.config.js`)? Located in the execution directory only?
- **Config overrides precedence:** full chain (default < config < env < CLI?). Where does env sit?
- **Dev port default:** a default port number as a requirement (e.g. 3000/4321/5173)?
- **Verbosity/logging:** does the PRD promise a log surface (e.g. `--verbose`, errors to stderr)?
- **CI/CD usage:** `build` must run non-interactively in a runner (no TTY/prompts), and the config's per-environment `base` path must support a deploy/CI environment (local/dev/preview/prod or similar), not just a single `is-prod` flag.

**Recommended defaults:** v1 flags = `--config <path>`, `--port <n>` on `dev`, `--output <dir>` on `build`, supremely minimal config (base + port only); fixed config filename in execution dir; precedence **default < config < CLI** (no env in v1); default dev port 4321; no dedicated verbosity flag (all messages one line, resolution warnings to stderr); `build` is non-interactive and CI-safe.

## Answer

**Commands:** `fea-docs dev` (serve + watch + auto-reload on save) and `fea-docs build` (emit static output), both run from the directory to render.

**Every option exists as *both* a CLI flag and a config entry** — `--port`, `--output`, `--strict`, `--base`, `--theme`, `--config` all have flag + config-key forms.

**Precedence:** **CLI flag > config file > built-in default**, and **every option has a default value** (so nothing is required from the user) — the *specific* default values are implementation detail, not PRD content.

**Config file:** fixed name `fea-docs.config.js` (JS/ESM) in the execution directory **only** (no upward parent-dir scanning) — this is how the conditional `base` path (local/dev/preview/prod) is expressed. **0-config default** otherwise; config is introduced only when needed.

**Help / usage:** `fea-docs --help` / bare invocation prints short usage; unknown subcommands or flags print an error + usage with a non-zero exit.

**CI:** `build` is deterministic and **never prompts / requires no TTY**; **`--strict`** (both flag and config prop) promotes warnings to failures.