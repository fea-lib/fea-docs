---
title: "Error-Path Rulebook"
labels: wayfinder:grilling
---

Type: grilling
Status: resolved
Blocked by:

## Question

The failsafe constraint is cross-cutting: every error-prone path in the tool has a *deterministic rule-based resolution* plus *informative CLI feedback describing how it was resolved*. The collision rule is an example (`.md` precedes `.mdx` on same route, with feedback) — the PRD needs the full rulebook of error paths and their rules.

Enumerate every error-prone path in `dev`/`build` and decide each one's rule + feedback:

- Route collisions (`.md` vs `.mdx`, duplicate slugs, dir vs file same slug)
- Unresolvable component imports (missing package, missing relative file)
- Broken internal `.md`/`.mdx` links; links to missing assets
- Missing `index.md`/`README.md` (directory with only subdirectories — no landing page)
- Empty root / no `.md`/`.mdx` files found
- Frontmatter parse failures (malformed YAML)
- Binary/non-UTF-8 files, huge files
- Port conflicts in `dev`
- Output-dir conflicts, read-only output
- Anything else you can foresee

For each: the deterministic resolution rule, and the feedback message shape. **Recommended framing:** resolutions are always "graceful + logged"; the CLI prints a warning line per auto-resolution in both `dev`/`build`, and `build` exits non-zero only where a hard failure is unavoidable.

## Answer

**Top-level principle:** graceful + warn by default; `build` exits non-zero only on hard failures. A **`--strict` flag promotes warnings to failures**, and `--strict` is also available as a **config prop** (both CLI flag and config). `build` is deterministic (no TTY, no prompts) — CI/CD-safe.

**Route/duplicate collisions:** `.md` wins every same-stem collision (e.g. `.md` before `.mdx`), with feedback. No file — including `index`/`README` — is special: each routes by its own filename slug and never as a directory landing page.

**Unresolvable imports:** a broken import statement is **not executed and rendered as visible fenced code blocks** — the import statement itself *and every usage of any binding from it* (statement-scoped, not per-binding). One broken binding ⇒ whole statement's usages wrapped. Rest of the file renders normally. Warns; `--strict` escalates to a failed build.

**Broken internal links / missing media:** a broken **text link** renders **struck-through** with a warning naming the dangling target; a missing **markdown media asset** (`![alt](url)`) renders the standard **broken-media fallback showing the alt text** with a warning. **Raw-HTML media** (`<img>`/`<video>`/`<audio>`) passes through as authored — no dedicated failsafe. All escalated by `--strict`.

**Directory with only deeper subdirs / `README` / files (no `index`):** renders as an **expander-only nav node** — not a link, never a page. If `index` exists in a directory it is an ordinary child file, presented exactly like any other. `README` is always a dedicated file entry; no directory is ever a link.

**Empty root / no renderable files:** warning ("no documents found"), builds an empty nav / message page; exit 0 unless `--strict`.

**Malformed frontmatter:** warning; block renders as a **plain code block** (not a parsed collapsed box), is **excluded from the search index**, and since `title` is unusable the page title falls back through the chain (H1 → filename); `--strict` fails.

**Non-UTF-8 / binary / oversized files:** **skipped with a warning** (named), excluded from render + index, never crashes the build; `--strict` fails.

**Dev port conflict:** if **no port configured** → default port auto-increments to the next free one, warning logs the actually-used port. If a **port is configured** (flag or config) and it's taken → `dev` **fails** (no silent fallback; explicit config must be honored — avoids colliding with unknown zombie processes).

**Output path:** written like a normal build tool — write to dir + remove prior files (likely inheriting Vite's behavior); no prompt. **Read-only output** → hard failure (non-zero, clear message).

**Symlinks:** **all symlinks skipped entirely in v1** (internal and external), each with a warning, excluded from render + index; `--strict` fails. Cycle-safety is moot since nothing is followed. (Revisit internal-symlink following in a later iteration.)

**Asset-copy conflicts:** stale assets cleared by the normal write/remove build semantics (no separate rule). Two sources mapping to the same output path → resolved with a logged rule + warn (`--strict` fails); exact tiebreak is implementation detail.

Because `build` runs in CI/CD (GitHub Actions / GitLab runners), also decide: which conditions make `build` **fail the pipeline** (exit non-zero) vs merely warn, and that `build` is deterministic (no TTY, no prompts) so a runner never hangs or produces non-reproducible output.