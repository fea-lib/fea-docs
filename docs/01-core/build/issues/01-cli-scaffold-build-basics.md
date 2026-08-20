---
title: "01 — CLI scaffold & build basics"
---

# 01 — CLI scaffold & build basics

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §1, §2, §9, §11, §13

**What to build:** Running `fea-docs build` in a directory recursively scans that directory for renderable content, honoring `.gitignore` in the execution context (root and any subdirectory) and never touching the tool's own output directory, and emits a static site to the default output directory. If the tree contains nothing renderable, it still builds — an empty nav with a message page — and exits 0. `fea-docs --help` and a bare invocation print usage; unknown subcommands or flags print an error plus usage and exit non-zero. The whole flow is deterministic and non-interactive — no TTY, no prompts.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `fea-docs build` scans the execution directory recursively without error
- [x] Ignore rules: `.gitignore` honored at root and subdirectory level; own output dir, `.git`, `node_modules` never scanned/copied
- [x] Empty/no-renderable root produces output with an empty nav and a message page; exit code 0
- [x] `fea-docs --help` and bare `fea-docs` print usage
- [x] Unknown subcommand or flag prints an error + usage and exits non-zero
- [x] Build is non-interactive and deterministic (no prompts, no TTY requirements, stable output artifact)

## Design Document

### 0. Git Branch
- **Implementation branch:** `new-v2` (all work for this ticket lands here).

### 1. CLI Entry Point & Command Routing
- **File Locations:**
  - Entry point: `/Users/tobiasbelch/workspaces/fea/lib/fea-docs/src/cli.ts`
  - Program & CLI routing: `/Users/tobiasbelch/workspaces/fea/lib/fea-docs/src/cli/program.ts`
- **Binary distribution & Compilation:** `/Users/tobiasbelch/workspaces/fea/lib/fea-docs/package.json` maps `"bin": { "fea-docs": "dist/cli.js" }`. TypeScript source files are compiled to ESM JavaScript via `tsc` (`npm run build`) into `dist/` before execution by Node.js (`#!/usr/bin/env node`).
- **Commander framework:** `/Users/tobiasbelch/workspaces/fea/lib/fea-docs/src/cli/program.ts` defines the root `fea-docs` CLI program, registering the `build` subcommand.
- **Invocation & Help Rules:**
  - Bare invocation (`fea-docs`) or `--help` / `-h` prints usage and exits `0`.
  - Unknown subcommands or flags trigger Commander's error handler, print error details plus usage, and exit non-zero (`1`).
  - All operations are completely non-interactive (no TTY or prompt requirements).

### 2. Build Subcommand (`fea-docs build`)
- **File Location:** `/Users/tobiasbelch/workspaces/fea/lib/fea-docs/src/cli/commands/build.ts`
- **Execution Context:** Runs from `process.cwd()` (the directory containing documentation to be built).
- **Options Surface:**
  - `--out-dir <path>` (default: `dist`)
  - `--config <path>` (optional path to config file)
  - `--strict` (strict validation mode)
- **Determinism & CI Safety:** Completely headless, non-interactive execution emitting a stable output artifact.

### 3. Recursive Scanning & Ignore Engine (`ContentGraphEngine`)
- **File Location:** `/Users/tobiasbelch/workspaces/fea/lib/fea-docs/src/content-graph/engine.ts`
- **Discovery:** Recursively scans execution directory for `**/*.md` and `**/*.mdx` using `fast-glob`.
- **Ignore Rules:**
  - Honors `.gitignore` files at the root and any subdirectory level using the `ignore` library.
  - Built-in exclusions (`DEFAULT_IGNORE_GLOBS`): own output directory (`dist/` or configured output dir), `.git`, `node_modules`.
  - Symbolic links are strictly skipped.

### 4. Empty / Non-Renderable Root Failsafe
- **File Locations:** Handled within `/Users/tobiasbelch/workspaces/fea/lib/fea-docs/src/cli/commands/build.ts` and `/Users/tobiasbelch/workspaces/fea/lib/fea-docs/src/content-graph/engine.ts`.
- **Zero Renderable Files:** If traversal yields 0 `.md`/`.mdx` files:
  - Emits an informative warning.
  - Builds successfully with exit code `0`.
  - Emits output containing an empty navigation tree and a default message page.

### 5. Automated Testing Strategy
- **Branch note:** Tests are written and run on the `new-v2` branch.
- **Testing Framework:** Vitest (`/Users/tobiasbelch/workspaces/fea/lib/fea-docs/src/__tests__/`).
- **Test Suites:**
  - **Content & Ignore Tests (`content-graph.test.ts`):** Uses temporary directories (`os.tmpdir()`) to verify recursive scanning, `.gitignore` rule adherence at root and subdirectories, and built-in exclusions (`node_modules`, `.git`, output dirs).
  - **CLI / Process Tests (`init.test.ts` / integration tests):** Executes CLI invocations or command handlers to verify:
    - Bare execution and `--help` exit `0` with usage output.
    - Unknown subcommands and invalid flags exit non-zero (`1`) with error messages + usage.
    - Empty or non-renderable project directories build successfully (exit code `0`) with empty nav and message page.
    - Non-interactive, headless execution without TTY prompts.

## Resolution

Resolved on `new-v2` per the design doc above; implementation notes and
hard-won conventions live in `docs/01-core/build/CONVENTIONS.md`.

- **Libraries:** `commander` 15 (routing, help, error + exit-code surface),
  `fast-glob` (recursive discovery + exclusion globs), `node-ignore`
  (`.gitignore` at root and every subdirectory), `valibot` (schema-verified
  option boundary). Compiled to ESM by `tsc` (NodeNext).
- **Tests:** `src/__tests__/{content-graph,build,cli,build-options}.test.ts`
  cover the acceptance boxes; run with `npm test` (38 tests).
- **Known future wiring (out of scope here):** `--config` and `--strict`
  parse and schema-verify, but are consumed by tickets 09/12. Real page
  rendering and the HTML/CSS shell land in tickets 02/03.
