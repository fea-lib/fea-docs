# fea-docs

Build a static documentation website from a directory of Markdown (`*.md`) and
MDX (`*.mdx`) files.

`fea-docs` is a standalone, headless Node CLI. Run it from the directory you
want to build: it recursively scans that directory for renderable content,
honors `.gitignore` (root and subdirectory level), always skips its own output
directory (plus `.git` and `node_modules`), and emits a deterministic static
site.

```console
fea-docs build
```

- `--out-dir <path>` — output directory (default: `dist`)
- `--config <path>` — config file path (default: `fea-docs.config.js` in the execution directory)
- `--strict` — promote warnings to failures (default: off)

`fea-docs --help` or a bare invocation prints usage and exits `0`. Unknown
subcommands and flags print an error plus usage and exit non-zero. Everything
is non-interactive and deterministic — no TTY, no prompts.

## Development

```sh
npm run build      # compile src/*.ts to dist/ with tsc
npm run clean      # remove dist/ (run before build after moving/removing sources)
npm run typecheck  # type-check without emitting
npm test           # run the vitest suites
```

Requires Node `>=22.12`. Distributed via the `fea-docs` bin (`dist/cli.js`).