---
title: "Build scope — agent conventions"
---

# Build scope — agent conventions

Hard-won rules for implementing tickets under `docs/01-core/build/`. Follow
these so earlier corrections do not regress.

## Provenance

- Source of truth: the PRD (`docs/01-core/prd/prd.md`) plus the individual
  build tickets in `docs/01-core/build/issues/`.
- **Never read `.legacy/`** for v2 implementation or as a tooling/config
  reference. It exists only to keep the old v1 blueprints out of the tree.
  If a v2 ticket references a library/API, verify it against current
  documentation and the installed package sources, not the archived code.

## CLI option surface

- Every CLI option has a declared default (PRD §9). Defaults live **once**:
  in `src/cli/commands/build-options.ts` (schema + exported constants), and
  commander's `.option(..., default)` references the same constants.
- Options cross the system boundary through the schema
  (`parseBuildOptions`), never through a raw cast of commander's `opts`.
  The schema derives the option type (`v.InferOutput`).
- Do **not** re-apply defaults inside the command action (`|| 'dist'`,
  `Boolean(flags.x)`, `|| undefined`). Commander + the schema already filled
  them; the action forwards parsed values untouched.
- The `--config` default is the fixed execution-directory file
  `fea-docs.config.js` (PRD §9).

## Path normalization

- `ContentGraphEngine` owns path normalization. Its constructor resolves
  `root` absolutely and `outDir` against that root. Downstream code (build,
  publisher, index rendering) must read the normalized `graph.root` /
  `graph.outDir` and not resolve again.
- `outputIgnoreGlobs` in `content-graph/defaults.ts` expects normalized
  absolute input.

## Commander framework

- entrypoint: `src/cli.ts` calls `program.parseAsync(process.argv)`; a bare
  invocation or `--help` prints usage (root-level action handles the bare
  case, exit 0), unknown subcommands/flags exit non-zero (1) via commander's
  error handler.
- Unknown **subcommands**: the root command declares an optional
  `[command]` argument and its action reports `Unknown command '...'`.
  Without that argument, commander would call them "too many arguments".
- In subcommand actions with no declared arguments, the action signature is
  `(options, command)` — the first parameter is the parsed options, not
  processed args.
- Test code must parse with `{ from: 'user' }` and enable `exitOverride()`
  on the root **and** every subcommand to capture exit codes.

## Toolchain

- `tsc` (native compiler, from the `typescript` package) does **not** prune
  outputs for sources that are removed or moved out of the compile root.
  `npm run clean` removes `dist/`; run it before `npm run build` whenever
  sources are renamed, moved, or excluded.
- `typescript` resolves a platform-specific binary via optional dependencies.
  If `npm run build` fails with `Unable to resolve
  @typescript/typescript-<platform>-<arch>`, install the matching package
  (`npm install @typescript/typescript-darwin-x64` on this machine) and
  re-sync; keep it out of `package.json` dependencies.
- Compound npm scripts — `"build": "rm -rf dist && tsc"` — break npm's bin
  resolution for `tsc`. Keep scripts to a single token and use separate
  npm scripts (`"clean"`) + `npm run clean`.
- `package.json`, `package-lock.json`, and the CLI `.version('...')` call
  must agree on the package version.
- Test infrastructure (harnesses, helpers) lives under `src/__tests__/` so
  it is excluded from `dist/`. `src/cli/` ships only real CLI code.

## Ignore semantics

- `.gitignore` files match against paths relative to their own directory;
  the engine walks the root-to-parent chain shallowest-first.
- The `ignore` library re-includes with `!` only for glob patterns
  (`drafts/*` + `!drafts/keep.md`), not trailing-slash directory patterns
  (`drafts/` + `!drafts/keep.md`). Tests must use the supported form.
- The tool's output directory, `.git`, and `node_modules` are always
  excluded; the output-directory exclusion comes from the engine's
  normalization.

## Determinism

- No prompts, no TTY requirements; every run is deterministic.
- Discovery sorts by byte order; emitted files use `\n`; output-writable
  errors surface as thrown errors (exit non-zero), never printed then
  continued.