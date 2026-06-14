---
title: "PRD: Selective Publishing (v1.0)"
---

## Context

fea-docs currently has a `build` command that generates a complete static MPA of all documentation files for a single deployment target. Users who maintain documentation for multiple audiences (e.g., public web, internal PDF, client-specific portals) must either run separate fea-docs projects or manually orchestrate filtering and deployment outside the tool.

The content graph engine and runtime adapter already provide file discovery, frontmatter parsing, and dynamic Astro project generation — the building blocks for a publish workflow that selects only relevant documents per target and deploys them independently.

## Problem Statement

Teams with multi-audience documentation need to:

1. Mark individual documents with their intended publication targets (e.g., `web`, `pdf`, `client-foo`).
2. Configure those targets with their deployment mechanics (git repo or local directory).
3. Publish only the documents matching a target to that target's destination.
4. Optionally include the source `.md`/`.mdx` files and their referenced assets alongside the built site.
5. Run the publish flow locally for testing and in CI for automated deployment.

Currently none of these workflows are supported — every build is an all-or-nothing full-site build with no deployment step.

## Goal

Add a `publish` command and corresponding config schema that enables selective, target-based documentation deployment.

## Non-Goals

- Continuous watching or auto-publishing on file changes (one-shot command).
- Publishing the same doc to multiple targets in a single command invocation (user runs `fea-docs publish web` then `fea-docs publish pdf` if they want both).
- Rollback or version management at the target destination (git history serves as audit trail).
- Permissions management or access control at the target (the user's git credentials and filesystem permissions apply).
- Transforming or re-rendering content per target (same build output for all targets).
- Concurrent publishing of multiple targets (sequential only).
- Integration with the existing `build` command (build remains all-docs, no target awareness).

## User Stories

1. As a docs author, I want to add `publishTo: web` to a document's frontmatter so that it is included when I publish to the `web` target.
2. As a docs author, I want to set `publishTo: [web, pdf]` in a document's frontmatter so that it is published to multiple targets.
3. As a docs author, I want to define publish targets in `fea-docs.config.mjs` with a type (`git` or `file`), a destination config, and an optional source-files directory, so that I can configure once and reuse.
4. As a docs author, I want to run `fea-docs publish web` to build and deploy only documents targeting `web`.
5. As a docs author, I want to run `fea-docs publish` without arguments to publish to all configured targets sequentially.
6. As a docs author, I want `fea-docs publish --dry-run` to show which documents would be published to each target without actually building or deploying.
7. As a docs author, I want `fea-docs publish web --force` to skip confirmation prompts for unattended CI usage.
8. As a docs author, I want `fea-docs publish web --clean` to re-clone the git repo from scratch instead of reusing the cached clone.
9. As a docs author, I want source `.md`/`.mdx` files and their referenced local assets to be copied alongside the build output when `sourcesTargetDir` is configured on a target.
10. As a docs author, I want a clear summary after publishing showing which targets succeeded, which failed, and how many documents were published per target.
11. As a docs author, I want to know which documents will be published for each target before anything runs.

## Proposed Solution

### Frontmatter field

A new optional `publishTo` field in document frontmatter. Accepts a single string or an array of strings, each matching a key in the config's `publish` map.

```markdown
---
title: API Reference
publishTo: web
---

# API Reference
```

```markdown
---
title: Internal Architecture
publishTo: [web, pdf]
---
```

- Absent or empty `publishTo` → document is never included in any publish target.
- Unknown target names are caught at publish time (warning + skip).

### Config schema: `publish` section

New top-level `publish` field on `FeaDocsConfig`:

```ts
interface FeaDocsConfig {
  // ... existing fields ...

  /** Named publish targets. Key is the target name used in frontmatter publishTo. */
  publish?: Record<string, PublishTarget>;
}

interface PublishTarget {
  type: 'git' | 'file';
  /** Optional subdirectory within the target for source files.
   *  When set, matched .md/.mdx files + their referenced local assets
   *  are copied here alongside the build output. */
  sourcesTargetDir?: string;
  config: GitTargetConfig | FileTargetConfig;
}

interface GitTargetConfig {
  /** Git remote URL (SSH or HTTPS). */
  repo: string;
  /** Branch to push to (e.g. "gh-pages"). */
  branch: string;
  /** Subdirectory within the cloned repo to place the build output into. */
  targetDir: string;
}

interface FileTargetConfig {
  /** Local filesystem path to rsync the build output into. */
  targetDir: string;
}
```

### Example config

```mjs
export default {
  frameworks: ['react', 'svelte'],
  publish: {
    web: {
      type: 'git',
      config: {
        repo: 'git@github.com:org/docs-site.git',
        branch: 'gh-pages',
        targetDir: 'docs-build',
      },
      sourcesTargetDir: 'docs-sources',
    },
    pdf: {
      type: 'file',
      config: {
        targetDir: '/var/www/docs',
      },
    },
  },
};
```

### Result layout

For the `web` target above, the git clone's working tree ends up as:

```
docs-site/
  docs-build/       ← Astro static MPA (only docs matching publishTo: web)
  docs-sources/     ← matched .md/.mdx files + referenced local assets
```

For the `file` target:

```
/var/www/docs/            ← rsync output
/var/www/docs/sources/    ← if sourcesTargetDir had been set
```

### Command: `fea-docs publish`

```
fea-docs publish [target] [options]
```

| Argument | Description |
|----------|-------------|
| `target` | Optional target name (a key in `config.publish`). If omitted, all targets are published sequentially. |

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dry-run` | boolean | false | Scan and report what would be published without building or deploying |
| `--force` | boolean | false | Skip confirmation prompts (for CI) |
| `--clean` | boolean | false | Re-clone git repos from scratch instead of reusing cached clones |

### Publish flow (per target)

```
fea-docs publish web

1. Resolve config → validate publish targets
2. Filter docs: collect all docs where frontmatter.publishTo includes "web"
3. [--dry-run] Print matched docs + target info → exit
4. Confirm unless --force (print targets + doc count)
5. If Git target:
   a. Clone repo into temp dir (or pull if clone exists)
   b. Build filtered Astro site into <temp>/<targetDir>/
   c. If sourcesTargetDir: copy matched .md/.mdx files + resolved asset refs
   d. git add . && git commit -m "publish(web): <n> docs" && git push
6. If File target:
   a. Build filtered Astro site into a temp dir
   b. rsync -a --delete <temp>/ <targetDir>/
   c. If sourcesTargetDir: rsync -a sources/ <targetDir>/<sourcesTargetDir>/
7. Print result (succeeded/failed + doc count)
```

### Build filtering approach

For a filtered publish build, the Astro project is generated in an **ephemeral temporary directory** (not the shared cache). The `content.config.ts` within that ephemeral project scopes its glob loader to only include documents matching the target. This means:

- The shared cache (`~/Library/Caches/fea-docs/workspaces/<hash>/app/`) is never modified.
- If the build errors, the shared cache is unaffected — next `fea-docs start` works normally.
- The ephemeral dir is cleaned up after the publish completes (or left on disk for debugging if `--debug` were ever added).

The filtered content config scopes the glob to only the matching files:

```ts
// Before (full build):
loader: glob({ base: 'src/content/docs', pattern: ['**/*.md', '**/*.mdx'] })

// After (filtered for "web" target):
// The loader pattern is narrowed, or the base directory is a filtered symlink farm
```

The most robust approach: create a temp directory with symlinks to only the matched source files under `src/content/docs/`, then build from there. This avoids re-parsing the glob pattern syntax and leverages the existing content layer unchanged.

### Source file resolution for `sourcesTargetDir`

When `sourcesTargetDir` is set, the matched `.md`/`.mdx` files are copied plus any local file they reference:

- Images: `![alt](path/to/img.png)` → resolved relative to the doc file
- Links: `[download](path/to/file.pdf)` → resolved
- `<Code src=` or `<img src=` → resolved
- Only local files (not external URLs) are copied
- Relative paths are preserved within the sources directory

The existing `link-asset/resolver.ts` already performs this kind of reference extraction and can be reused.

### Git temp dir management

- Cache location: `<os-tmpdir>/fea-docs-publish/<target-name>/`
- On publish: if dir exists and has a git repo, `git pull` (fetch + reset `origin/<branch>`)
- On `--clean`: remove the cached clone before cloning fresh
- After successful push: keep the clone for faster subsequent publishes

## Deep Module Impact

- **New file:** `src/cli/commands/publish.ts` — the publish command implementation (~250 lines)
- **Modified:** `src/cli/program.ts` — add `import { publishCommand }` and `program.addCommand(publishCommand())`
- **Modified:** `src/types.ts` — add `PublishTarget`, `GitTargetConfig`, `FileTargetConfig` interfaces
- **Modified:** `src/runtime/adapter.ts` — add method to generate a filtered Astro project in a custom temp dir (reuses existing `writeContentConfig`, `writeAstroConfig`, `installDeps`, `runBuild`)
- **Modified:** `src/config/resolver.ts` — resolve and validate the `publish` section (unknown types → warning + skip, missing fields → warning + skip)
- **Modified:** `src/content-graph/parser.ts` — optionally expose `publishTo` from frontmatter (for scan-time filtering)
- **New file:** `src/publish/git-publisher.ts` — git clone/pull/add/commit/push logic
- **New file:** `src/publish/file-publisher.ts` — rsync logic
- **New file:** `src/publish/source-copier.ts` — resolve and copy source files + asset refs
- **Modified:** `src/index.ts` — export new types
- **Tests:** `src/__tests__/publish.test.ts`

## Acceptance Criteria

1. A document with `publishTo: web` in frontmatter is included when running `fea-docs publish web` and excluded when running `fea-docs publish pdf`.
2. A document with `publishTo: [web, pdf]` is included in both target publishes.
3. A document without `publishTo` is never included in any publish.
4. `fea-docs publish` (no target) publishes to all configured targets sequentially, showing a per-target summary.
5. `fea-docs publish --dry-run` prints all matched docs per target and exits without building or deploying.
6. `fea-docs publish --force` skips the confirmation prompt.
7. `fea-docs publish bogus` prints a warning that target "bogus" does not exist and exits.
8. `fea-docs publish web` for a git target clones the repo, places the build in `targetDir`, commits, and pushes.
9. `fea-docs publish web` for a git target where the clone already exists pulls latest changes before adding new files.
10. `fea-docs publish web --clean` removes the cached clone and re-clones fresh.
11. `fea-docs publish pdf` for a file target rsyncs the build output to `targetDir` with `--delete`.
12. When `sourcesTargetDir` is configured, `.md`/`.mdx` files and their referenced local assets appear in that subdirectory at the target.
13. After a failed publish build, the normal `fea-docs start` and `fea-docs build` commands continue to work unaffected.
14. Unknown target `type` in config prints a warning and skips that target.
15. A doc referencing a non-existent target in `publishTo` prints a warning for that doc and skips it.
16. A target with no matching docs prints a warning and skips the deploy step.

## Edge Cases

- **No `publish` section in config** → `fea-docs publish` prints "No publish targets configured" and exits.
- **Target name in `publishTo` doesn't match any config key** → per-doc warning, doc is skipped for that target.
- **Target with `type: 'file'` and `targetDir` doesn't exist** → parent directories are created.
- **Git push fails (auth, network, diverged)** → error message printed, target marked as failed, next target continues.
- **Multiple docs with same relative path across different source dirs** → handled by existing content graph dedup.
- **No docs match any target** → warning printed, no build or deploy occurs.
- **Git target with `targetDir` at repo root (`""`)** → build output goes at repo root. Must still be a valid path segment.
- **`sourcesTargetDir` set but no docs match** → no source copying occurs (target is skipped).
- **File target with same `targetDir` as another target** → each publish overwrites independently (last one wins if run sequentially).
- **Concurrent `fea-docs publish` invocations targeting the same git repo** → not supported; second will fail on git push.

## Testing Decisions

- Unit test: doc filtering by `publishTo` (single value, array, absent).
- Unit test: config schema validation (unknown type, missing fields).
- Unit test: git publisher logic with a local bare repo fixture.
- Unit test: file publisher with tmp dir rsync target.
- Unit test: source copier resolves and copies only local asset references.
- Unit test: ephemeral build dir does not pollute shared cache.
- Manual: `fea-docs publish web` from example dir with a configured git target.
- Manual: `fea-docs publish --dry-run` to preview behavior without side effects.

## Risks and Mitigations

- **Risk:** Git push requires authentication (SSH agent or HTTPS token).
  - **Mitigation:** fea-docs uses the system's git credentials. The user must have auth configured. Error messaging tells the user to check their git credentials.
- **Risk:** `rsync -a --delete` could accidentally delete user files if `targetDir` is misconfigured.
  - **Mitigation:** `--dry-run` lets users preview. The publish summary prints the resolved target path for confirmation.
- **Risk:** Ephemeral build dir could consume significant disk space for large docs sites.
  - **Mitigation:** Temp dir is cleaned after publish completes. For extremely large sites, the user can set `TMPDIR` to a location with sufficient space.
- **Risk:** Concurrent publishes to the same git target could cause race conditions.
  - **Mitigation:** Documented as unsupported. Git push would fail with non-fast-forward, which is caught and reported.
- **Risk:** Source asset resolution may miss dynamically referenced files (e.g., JS-constructed paths).
  - **Mitigation:** Only statically analyzable references (Markdown image/link syntax, HTML `<img src>`, `<a href>`, `<Code src>`) are resolved. Dynamic refs are out of scope.

## Proposed Vertical Slices (Tracer Bullets)

1. **Title:** Config schema + validation + CLI scaffold
   - **Type:** AFK
   - **Blocked by:** None
   - **What this slice proves:** The `publish` config section is parsed, validated (unknown type → warning, missing fields → warning), and exposed via a new `fea-docs publish` command that prints targets configured or exits gracefully.
   - **Acceptance checks:**
     - Config with valid `publish` section loads without error.
     - Config with unknown `type` warns and skips that target.
     - Config missing required fields warns and skips.
     - `fea-docs publish` without targets in config prints "No publish targets configured".
     - `fea-docs publish` with targets prints a summary of configured targets and exits (no build yet).
     - `fea-docs publish bogus` warns "target 'bogus' not found".

2. **Title:** Doc filtering by `publishTo` frontmatter + build in ephemeral dir
   - **Type:** AFK
   - **Blocked by:** #1
   - **What this slice proves:** Documents are filtered by their `publishTo` frontmatter, and an Astro build of only those documents succeeds in an ephemeral temp directory, leaving the shared cache untouched.
   - **Acceptance checks:**
     - Documents with `publishTo: web` are included; documents without are excluded.
     - Documents with `publishTo: [web, pdf]` are included for both targets.
     - Ephemeral build dir is cleaned up after success.
     - After a publish build, `fea-docs start` still shows all documents (cache not polluted).

3. **Title:** File target publisher (rsync)
   - **Type:** AFK
   - **Blocked by:** #2
   - **What this slice proves:** After a filtered build, the output is rsynced to the configured `targetDir`.
   - **Acceptance checks:**
     - `rsync -a --delete` copies build output to `targetDir`.
     - Previously-existing files at `targetDir` that are not in the build output are removed.
     - If `sourcesTargetDir` is set, source files appear in `<targetDir>/<sourcesTargetDir>/`.

4. **Title:** Git target publisher (clone → add → commit → push)
   - **Type:** AFK
   - **Blocked by:** #2
   - **What this slice proves:** After a filtered build, the output is placed in a git repo's `targetDir`, committed, and pushed.
   - **Acceptance checks:**
     - Repo is cloned into temp dir on first publish.
     - On subsequent publish, `git pull` is run before adding new files.
     - Build output lands in `targetDir` subdirectory.
     - Commit message includes target name and doc count.
     - `--clean` removes cached clone and re-clones.

5. **Title:** Source file copying for `sourcesTargetDir`
   - **Type:** AFK
   - **Blocked by:** #2
   - **What this slice proves:** When `sourcesTargetDir` is set, matched `.md`/`.mdx` files and their referenced local assets are resolved and copied.
   - **Acceptance checks:**
     - Matched `.md` files are copied with preserved relative paths.
     - Images referenced via `![alt](img.png)` are resolved and copied.
     - External URLs are not copied.
     - Unreferenced files in the project are not copied.

6. **Title:** `--dry-run` and `--force` flags
   - **Type:** AFK
   - **Blocked by:** #2
   - **What this slice proves:** `--dry-run` prints docs per target and exits without building; `--force` skips confirmation.
   - **Acceptance checks:**
     - `--dry-run` lists matched docs per target, no build output created.
     - `--force` suppresses the "Publish N docs to target X? (y/N)" prompt.
     - `--dry-run` with `--force` = dry-run wins (no build, no prompt).

## Dependency Graph (summary)

- Foundation: #1 (config + CLI scaffold)
- Core engine: #2 (doc filtering + ephemeral build)
- Delivery mechanism: #3 (file rsync), #4 (git push) — parallel after #2
- Polish: #5 (source copying) — after #2, parallel with #3/#4
- UX: #6 (dry-run/force) — after #2, parallel

## Review Questions

1. Should the `--debug` flag be added to keep the ephemeral build dir for inspection after failure? (Proposed: defer to future PR.)
2. Should `sourcesTargetDir` support an absolute path outside the target? (Proposed: always relative to the target's output root.)
3. Should `fea-docs publish` accept multiple target names? e.g., `fea-docs publish web pdf` (Proposed: defer — single target or all for now.)

---

## Implementation Plan

### Ticket 1: Config schema, validation, and CLI scaffold (AFK)

**Blocked by:** None

**What this proves:** The `publish` config section is parsed, validated, and exposed via a new `fea-docs publish` command. No build or deploy logic yet.

**Files to modify:**
- `src/types.ts` — add `PublishTarget`, `GitTargetConfig`, `FileTargetConfig`, `ResolvedPublishTarget` interfaces
- `src/cli/program.ts` — import and register the publish command
- `src/index.ts` — export new types
- `src/config/resolver.ts` — resolve and validate `publish` section

**Files to create:**
- `src/cli/commands/publish.ts` — publish command scaffold (no build logic yet)

**Changes:**

`src/types.ts` — add after existing types:
```ts
export interface GitTargetConfig {
  repo: string;
  branch: string;
  targetDir: string;
}

export interface FileTargetConfig {
  targetDir: string;
}

export type PublishTargetType = 'git' | 'file';

export interface PublishTarget {
  type: PublishTargetType;
  sourcesTargetDir?: string;
  config: GitTargetConfig | FileTargetConfig;
}

export interface ResolvedPublishTarget extends PublishTarget {
  name: string;
}
```

`src/config/resolver.ts` — inside `resolveConfig()`, after existing field resolution, add:
```ts
const resolvedPublish: Record<string, ResolvedPublishTarget> = {};
if (config.publish) {
  for (const [name, target] of Object.entries(config.publish)) {
    if (!target.type || !['git', 'file'].includes(target.type)) {
      console.warn(`  Publish target "${name}": unknown type "${target.type}", skipping`);
      continue;
    }
    if (target.type === 'git') {
      const gitCfg = target.config as Record<string, unknown>;
      if (!gitCfg.repo || !gitCfg.branch || !gitCfg.targetDir) {
        console.warn(`  Publish target "${name}": missing required git fields (repo, branch, targetDir), skipping`);
        continue;
      }
    }
    if (target.type === 'file') {
      const fileCfg = target.config as Record<string, unknown>;
      if (!fileCfg.targetDir) {
        console.warn(`  Publish target "${name}": missing required file field (targetDir), skipping`);
        continue;
      }
    }
    resolvedPublish[name] = { name, ...target };
  }
}
```

`src/cli/commands/publish.ts` — scaffold:
```ts
import { Command } from 'commander';
import pc from 'picocolors';
import { resolveConfig } from '../../config/resolver.js';

interface PublishOptions {
  dryRun?: boolean;
  force?: boolean;
  clean?: boolean;
}

export function publishCommand(): Command {
  return new Command('publish')
    .description('Build and deploy docs to one or all configured publish targets')
    .argument('[target]', 'Target name from fea-docs.config.mjs publish section')
    .option('--dry-run', 'Show what would be published without building or deploying')
    .option('--force', 'Skip confirmation prompts (use in CI)')
    .option('--clean', 'Re-clone git repos from scratch instead of reusing cached clones')
    .action(async (target?: string, opts?: PublishOptions) => {
      try {
        const config = await resolveConfig({});
        if (!config.publish || Object.keys(config.publish).length === 0) {
          console.log(pc.yellow('No publish targets configured in fea-docs.config.mjs.'));
          process.exit(0);
        }
        if (target && !config.publish[target]) {
          console.log(pc.red(`Publish target "${target}" not found in config.`));
          console.log(`Available targets: ${Object.keys(config.publish).join(', ')}`);
          process.exit(1);
        }
        const targets = target
          ? [config.publish[target]]
          : Object.values(config.publish);

        console.log(pc.cyan('\nPublish targets:'));
        for (const t of targets) {
          console.log(`  ${t.name} (${t.type}) → ${t.type === 'git' ? (t.config as GitTargetConfig).repo : (t.config as FileTargetConfig).targetDir}`);
        }

        if (opts?.dryRun) {
          console.log(pc.cyan('\nDry-run — no build or deploy performed.'));
          process.exit(0);
        }

        // TODO: Ticket 2+ will wire the full flow here
        console.log(pc.green('\nConfig valid. Ready to publish.'));
      } catch (err) {
        console.error(pc.red('Error:'), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
```

**Acceptance checks:**
- Config with valid `publish` section loads without error.
- Config with `type: 'bogus'` warns and skips that target.
- Config with missing git fields warns and skips.
- `fea-docs publish` without targets in config prints "No publish targets configured".
- `fea-docs publish` with targets prints target summary.
- `fea-docs publish bogus` prints "target not found" with available list.
- `fea-docs publish --dry-run` prints summary and exits without building.

---

### Ticket 2: Doc filtering by `publishTo` + ephemeral build (AFK)

**Blocked by:** Ticket 1

**What this proves:** Documents are filtered by their `publishTo` frontmatter, and a filtered Astro build runs in an ephemeral temp directory without polluting the shared cache.

**Files to modify:**
- `src/cli/commands/publish.ts` — wire the full publish flow (resolve docs, filter, build)
- `src/content-graph/parser.ts` — ensure `publishTo` is accessible from parsed frontmatter (already in `Record<string, unknown>`, may need type export)
- `src/runtime/adapter.ts` — add method to generate a filtered Astro project in a custom output dir

**New supporting functions (in `src/cli/commands/publish.ts` or a new `src/publish/filter.ts`):**

```ts
/** Filter a DocsGraph to only pages whose publishTo includes the given target. */
function filterDocsByTarget(graph: DocsGraph, targetName: string): DocPage[] {
  return graph.pages.filter((page) => {
    const pt = page.frontmatter.publishTo;
    if (!pt) return false;
    if (typeof pt === 'string') return pt === targetName;
    if (Array.isArray(pt)) return pt.includes(targetName);
    return false;
  });
}
```

**RuntimeAdapter changes** (`src/runtime/adapter.ts`):

Add a method to create a filtered Astro project in a given output directory:

```ts
async createFilteredBuild(
  pages: DocPage[],
  targetDir: string,
  config: ResolvedConfig,
): Promise<string> {
  // Same as initialiseProject() but:
  // 1. Uses targetDir instead of cache projectDir
  // 2. Only symlinks the filtered pages under src/content/docs/
  // 3. Generates content.config.ts scoped to those files
  // 4. Runs npm install + astro build
  // Returns the output path
}
```

The filtered content is mounted by creating symlinks in the ephemeral project's `src/content/docs/` only for the matched pages, preserving their relative directory structure. This way Astro's glob loader picks up exactly the right files.

**Publish flow update** (`src/cli/commands/publish.ts`):

```ts
// Inside the publish action, after resolving targets:
for (const target of targets) {
  // Step 1: Filter docs
  const matchedDocs = filterDocsByTarget(docsGraph, target.name);
  if (matchedDocs.length === 0) {
    console.log(pc.yellow(`  No documents match target "${target.name}", skipping.`));
    continue;
  }

  console.log(pc.cyan(`\nTarget "${target.name}": ${matchedDocs.length} document(s)`));

  // Step 2: Build in ephemeral dir
  const adapter = new RuntimeAdapter(/* ... */);
  const buildOutDir = await adapter.createFilteredBuild(
    matchedDocs,
    fs.mkdtempSync(path.join(os.tmpdir(), `fea-docs-publish-${target.name}-`)),
    config,
  );

  // Steps 3-6 (deploy) will be added in Tickets 3/4
  console.log(pc.green(`  Built ${matchedDocs.length} docs for "${target.name}"`));
}
```

**Acceptance checks:**
- Documents with `publishTo: web` are included; documents without are excluded.
- Documents with `publishTo: [web, pdf]` are included for both targets.
- Documents with absent `publishTo` are never included.
- Ephemeral build dir is cleaned up after success.
- After a publish build, `fea-docs start` still shows all documents.

---

### Ticket 3: File target publisher — rsync (AFK)

**Blocked by:** Ticket 2

**What this proves:** After a filtered build, the output is rsynced to the file target's `targetDir`. Source files are optionally copied when `sourcesTargetDir` is set.

**Files to create:**
- `src/publish/file-publisher.ts`

```ts
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface FilePublisherOptions {
  targetDir: string;
  sourcesTargetDir?: string;
  buildDir: string;
  sourceFilesDir?: string;  // path to collected source files
}

export function publishToFile(options: FilePublisherOptions): void {
  const { targetDir, sourcesTargetDir, buildDir, sourceFilesDir } = options;

  // Ensure parent dir exists
  fs.mkdirSync(targetDir, { recursive: true });

  // Rsync build output
  execSync(`rsync -a --delete "${buildDir}/" "${targetDir}/"`, { stdio: 'inherit' });
  console.log(`  Build output → ${targetDir}`);

  // Rsync source files if configured
  if (sourcesTargetDir && sourceFilesDir) {
    const sourceTarget = path.join(targetDir, sourcesTargetDir);
    fs.mkdirSync(sourceTarget, { recursive: true });
    execSync(`rsync -a --delete "${sourceFilesDir}/" "${sourceTarget}/"`, { stdio: 'inherit' });
    console.log(`  Sources → ${sourceTarget}`);
  }
}
```

**Integration in `publish.ts`:**

```ts
if (target.type === 'file') {
  const fileCfg = target.config as FileTargetConfig;
  publishToFile({
    targetDir: fileCfg.targetDir,
    sourcesTargetDir: target.sourcesTargetDir,
    buildDir: buildOutDir,
    sourceFilesDir: sourcesTempDir,  // populated by Ticket 5
  });
}
```

**Acceptance checks:**
- `rsync -a --delete` copies build output to `targetDir`.
- Old files at `targetDir` not in build output are removed.
- If `sourcesTargetDir` is set, source files appear in `<targetDir>/<sourcesTargetDir>/`.
- Parent directories are created if missing.

---

### Ticket 4: Git target publisher — clone/add/commit/push (AFK)

**Blocked by:** Ticket 2

**What this proves:** After a filtered build, the output is placed in a git repo clone, committed, and pushed.

**Files to create:**
- `src/publish/git-publisher.ts`

```ts
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface GitPublisherOptions {
  repo: string;
  branch: string;
  targetDir: string;
  sourcesTargetDir?: string;
  buildDir: string;
  sourceFilesDir?: string;
  name: string;
  docCount: number;
  clean?: boolean;
}

function getCloneDir(repo: string): string {
  const safeName = repo.replace(/[^a-zA-Z0-9_-]/g, '-');
  return path.join(os.tmpdir(), 'fea-docs-publish', safeName);
}

export function publishToGit(options: GitPublisherOptions): void {
  const { repo, branch, targetDir, buildDir, name, docCount, clean } = options;
  const cloneDir = getCloneDir(repo);

  // Clone or pull
  if (clean && fs.existsSync(cloneDir)) {
    fs.rmSync(cloneDir, { recursive: true });
  }

  if (!fs.existsSync(cloneDir)) {
    fs.mkdirSync(cloneDir, { recursive: true });
    execSync(`git clone --depth 1 --branch "${branch}" "${repo}" "${cloneDir}"`, {
      stdio: 'inherit',
    });
  } else {
    execSync(`git -C "${cloneDir}" pull origin "${branch}"`, { stdio: 'inherit' });
  }

  // Copy build output into targetDir
  const targetPath = path.join(cloneDir, targetDir);
  fs.mkdirSync(targetPath, { recursive: true });
  execSync(`rsync -a --delete "${buildDir}/" "${targetPath}/"`, { stdio: 'inherit' });

  // Copy sources if configured
  if (options.sourcesTargetDir && options.sourceFilesDir) {
    const sourceTarget = path.join(cloneDir, options.sourcesTargetDir);
    fs.mkdirSync(sourceTarget, { recursive: true });
    execSync(`rsync -a --delete "${options.sourceFilesDir}/" "${sourceTarget}/"`, {
      stdio: 'inherit',
    });
  }

  // Commit and push
  execSync(`git -C "${cloneDir}" add .`, { stdio: 'inherit' });
  try {
    execSync(`git -C "${cloneDir}" commit -m "publish(${name}): publish ${docCount} docs"`, {
      stdio: 'inherit',
    });
  } catch {
    // Nothing to commit — no changes
    console.log('  No changes to commit.');
  }
  execSync(`git -C "${cloneDir}" push origin "${branch}"`, { stdio: 'inherit' });
}
```

**Integration in `publish.ts`:**

```ts
if (target.type === 'git') {
  const gitCfg = target.config as GitTargetConfig;
  publishToGit({
    repo: gitCfg.repo,
    branch: gitCfg.branch,
    targetDir: gitCfg.targetDir,
    sourcesTargetDir: target.sourcesTargetDir,
    buildDir: buildOutDir,
    sourceFilesDir: sourcesTempDir,
    name: target.name,
    docCount: matchedDocs.length,
    clean: opts?.clean,
  });
}
```

**Acceptance checks:**
- Repo is cloned into `os.tmpdir()/fea-docs-publish/<safe-repo-name>` on first publish.
- On subsequent publish, `git pull origin <branch>` is run before adding files.
- Build output lands in `targetDir` subdirectory of the clone.
- Commit message format: `publish(<name>): publish <N> docs`.
- `--clean` removes cached clone and re-clones fresh.
- Push failure prints error and continues to next target.

---

### Ticket 5: Source file resolution and copying for `sourcesTargetDir` (AFK)

**Blocked by:** Ticket 2

**What this proves:** When `sourcesTargetDir` is set, matched `.md`/`.mdx` files and their referenced local assets are resolved and collected into a temp directory for downstream copying.

**Files to create:**
- `src/publish/source-copier.ts`

```ts
import fs from 'node:fs';
import path from 'node:path';

/** Regex to find local file references in markdown content. */
const LOCAL_REF_RE = /(?:!\[.*?\]\(([^)]+)\)|\[.*?\]\(([^)]+)\)|<(?:img|a|Code)\s[^>]*?(?:src|href)=["']([^"']+)["'])/g;

/** Collect local asset paths referenced from a doc's content. */
function extractLocalRefs(content: string, docDir: string, root: string): Set<string> {
  const refs = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = LOCAL_REF_RE.exec(content)) !== null) {
    const rawPath = match[1] || match[2] || match[3];
    if (!rawPath) continue;
    if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) continue;
    const resolved = path.resolve(docDir, rawPath);
    if (resolved.startsWith(root) && fs.existsSync(resolved)) {
      refs.push(resolved);
    }
  }
  return refs;
}

export interface SourceCopierOptions {
  matchedPages: { absolutePath: string; relativePath: string }[];
  root: string;
  outputDir: string;
}

export function collectSources(options: SourceCopierOptions): void {
  const { matchedPages, root, outputDir } = options;
  const copied = new Set<string>();

  for (const page of matchedPages) {
    const docDir = path.dirname(page.absolutePath);
    const content = fs.readFileSync(page.absolutePath, 'utf-8');
    const refs = extractLocalRefs(content, docDir, root);

    // Copy the doc file itself
    const docDest = path.join(outputDir, page.relativePath);
    fs.mkdirSync(path.dirname(docDest), { recursive: true });
    fs.copyFileSync(page.absolutePath, docDest);
    copied.push(page.absolutePath);

    // Copy referenced assets
    for (const ref of refs) {
      const relRef = path.relative(root, ref);
      const dest = path.join(outputDir, relRef);
      if (!copied.has(ref)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(ref, dest);
        copied.push(ref);
      }
    }
  }

  console.log(`  Sources collected: ${copied.size} file(s)`);
}
```

**Integration in `publish.ts`:** Between build and deploy steps, conditionally run `collectSources()` and pass the temp dir to the publisher.

**Acceptance checks:**
- Matched `.md`/`.mdx` files are copied preserving relative paths.
- Images referenced via `![alt](img.png)` are resolved and copied.
- External URLs are not copied or resolved.
- Unreferenced files in the project are not copied.
- Assets in parent directories (relative `../../img/foo.png`) are resolved correctly.

---

### Ticket 6: `--dry-run` and `--force` flags + publish summary (AFK)

**Blocked by:** Ticket 2

**What this proves:** `--dry-run` prints per-target doc lists without building; `--force` skips the confirmation prompt; a final summary shows success/failure per target.

**Changes to `src/cli/commands/publish.ts`:**

`--dry-run` flow (runs before any build):
```ts
// During the per-target loop, if dryRun:
if (opts?.dryRun) {
  console.log(pc.cyan(`\nTarget "${target.name}":`));
  console.log(`  Type: ${target.type}`);
  console.log(`  Matched docs (${matchedDocs.length}):`);
  for (const doc of matchedDocs) {
    console.log(`    - ${doc.relativePath}`);
  }
  if (target.sourcesTargetDir) {
    console.log(`  Sources → ${target.sourcesTargetDir}`);
  }
  continue; // skip to next target
}
```

Confirmation prompt (between filtering and building):
```ts
if (!opts?.force) {
  const answer = await question(
    `\nPublish ${matchedDocs.length} document(s) to "${target.name}" (${target.type})? ${pc.dim('(y/N)')} `,
  );
  if (!answer.toLowerCase().startsWith('y')) {
    console.log(pc.yellow('  Skipped.'));
    continue;
  }
}
```

(Note: uses a simple readline prompt, or the `@inquirer/prompts` package if already present.)

Summary at the end:
```ts
const results: { target: string; status: 'succeeded' | 'failed'; reason?: string }[] = [];

// Push results per target after each attempt
results.push({ target: target.name, status: 'succeeded' });

// On catch:
results.push({ target: target.name, status: 'failed', reason: err.message });

// At end:
console.log(pc.cyan('\nPublish summary:'));
for (const r of results) {
  const icon = r.status === 'succeeded' ? pc.green('✓') : pc.red('✗');
  console.log(`  ${icon} ${r.target}: ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
}
const failed = results.filter(r => r.status === 'failed');
if (failed.length > 0) process.exit(1);
```

**Acceptance checks:**
- `--dry-run` prints matched docs per target, no build output created, no deploy attempted.
- `--force` skips the "Publish N docs to target X?" prompt.
- `--dry-run` with `--force` = dry-run wins (no build, no prompt).
- Final summary shows which targets succeeded/failed.
- Exit code is 0 if all succeed, 1 if any fail.

---

### File change summary

| File | Action | Lines |
|------|--------|-------|
| `src/types.ts` | **Edit** | +15 (new interfaces) |
| `src/cli/program.ts` | **Edit** | +2 (import + register) |
| `src/cli/commands/publish.ts` | **Create** | ~180 (full command) |
| `src/config/resolver.ts` | **Edit** | +25 (publish section validation) |
| `src/runtime/adapter.ts` | **Edit** | +40 (filtered build method) |
| `src/publish/file-publisher.ts` | **Create** | ~35 |
| `src/publish/git-publisher.ts` | **Create** | ~70 |
| `src/publish/source-copier.ts` | **Create** | ~60 |
| `src/publish/filter.ts` | **Create** | ~20 |
| `src/__tests__/publish.test.ts` | **Create** | ~150 |
| `src/index.ts` | **Edit** | +1 (export) |

### Dependency graph

```
Ticket 1 (config + CLI scaffold)
  └── Ticket 2 (doc filtering + ephemeral build)
       ├── Ticket 3 (file rsync) — parallel
       ├── Ticket 4 (git push) — parallel
       ├── Ticket 5 (source copier) — parallel
       └── Ticket 6 (dry-run/force/summary) — parallel
```
