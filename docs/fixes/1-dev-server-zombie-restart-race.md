---
title: "Dev server zombie processes and restart race"
status: open
---

# Bug Report & Fix Plan: Dev server zombie processes and restart race

## Bug summary

When the workspace portal stops a docs session, `fea-docs`'s `node astro dev` grandchild process survives
as a zombie, holding the assigned port open. On the next start attempt, Vite falls back to a higher
port, the portal health-checks the original assigned port, and the session is marked unhealthy.

Separately, on cache-hit materialization, the runtime rewrites `astro.config.mjs` (among other files)
even when nothing changed. Astro's file watcher triggers a dev-server restart mid-flight, racing with
Vite's dependency pre-bundling and causing `deps_temp_*` ENOENT errors.

## Evidence

```
08:57:21 Starting dev server on port 9302...
08:57:21 Configuration file updated. Restarting...
08:57:23 [ERROR] ENOENT: no such file or directory, open
  'node_modules/.vite/deps_temp_b659ec02/astro_runtime_client_dev-toolbar_entrypoint__js.js'
...
 astro  v6.4.8 ready in 2896 ms
┃ Local    http://localhost:9305/
```

After cleanup, ports 9302–9305 remained occupied:

```
$ lsof -i -P | grep 930[0-6]
# … node processes bound to 9302–9305 survived
```

## Root causes

### Cause 1 – No SIGTERM handler

`src/cli/commands/start.ts:127–130` registers a shutdown handler for `SIGINT` only:

```typescript
process.on('SIGINT', () => {
  adapter.stopDev();
  process.exit(0);
});
```

The portal sends `SIGKILL` (unblockable). Even if the portal switches to `SIGTERM` (as planned),
this handler won't fire, so `adapter.stopDev()` is never called and the `node astro dev` child
runs forever.

### Cause 2 – Config rewrites trigger unnecessary restart

`adapter.materialize({ fresh: false })` at `src/runtime/adapter.ts:48–57` always rewrites the
full set of runtime files:

- `package.json` (via `writePackageJson`)
- `remark-rewrite-md-links.mjs` (via `writeRemarkPlugin`)
- `remark-strip-lead-h1.mjs` (via `writeStripLeadH1Plugin`)
- `astro.config.mjs` (via `writeAstroConfig`)
- `src/content/docs` symlink (via `writeContentLinks`)
- `src/content.config.ts` (via `writeContentConfig`)

Even when no content has changed, the file writes update the mtime, which Astro's file watcher
detects. It then triggers a full dev-server restart, re-running Vite's dependency optimizer.
If this happens while the optimizer is mid-flight, the temp `deps_temp_*` directory may be
cleaned up prematurely → `ENOENT` error.

---

# Fix plan

## Ticket F1: Add SIGTERM handler for clean shutdown

**File:** `src/cli/commands/start.ts`

**Changes:**

Extract the shutdown logic into a shared function and register both signals:

```typescript
let shuttingDown = false;

const shutdown: NodeJS.SignalsListener = (signal) => {
  if (shuttingDown) return;           // debounce duplicate signals
  shuttingDown = true;
  console.error(`Received ${signal}, shutting down...`);
  adapter.stopDev();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

**Rationale:** `SIGTERM` is the standard polite-termination signal used by process supervisors
(launchd, systemd) and by the workspace portal's planned process-group kill. Without it,
`stopDev()` never runs and the `astro dev` child is orphaned.

**Acceptance criteria:**
- Sending `kill -TERM <fea-docs-pid>` causes `adapter.stopDev()` to be called and the
  `astro dev` child process to exit within 1 second.
- Sending `kill -INT <fea-docs-pid>` continues to work as before.
- Rapid duplicate signals (`TERM` then `TERM`, or `INT` then `TERM`) are debounced and do
  not cause errors.

---

## Ticket F2: Skip writing runtime files when content hasn't changed

**File:** `src/runtime/adapter.ts`

**Changes:**

In each `write*` method, compare the generated content with the existing file on disk.
Skip writing when the content is identical.

**Utility helper** (add to `adapter.ts` or a shared util):

```typescript
function writeIfChanged(filePath: string, content: string): boolean {
  try {
    const existing = fs.readFileSync(filePath, 'utf-8');
    if (existing === content) return false;   // no change
  } catch {
    // file doesn't exist — always write
  }
  fs.writeFileSync(filePath, content);
  return true;
}
```

**Affected methods:**

| Method | File written | Guard |
|--------|-------------|-------|
| `writePackageJson` | `package.json` | Already mostly static; only changes when `config.dependencies` changes. |
| `writeRemarkPlugin` | `remark-rewrite-md-links.mjs` | Changes when slug map changes (new/renamed pages). |
| `writeStripLeadH1Plugin` | `remark-strip-lead-h1.mjs` | Static — never changes. |
| `writeAstroConfig` | `astro.config.mjs` | Changes when title, base, port, aliases, frameworks, or vite.fs.allow changes. |
| `writeContentLinks` | `src/content/docs` symlink | Only needs rewriting if the symlink target changed (rare — only when `config.root` changes). |
| `writeContentConfig` | `src/content.config.ts` | Changes when page list changes (new/deleted docs). |

**For the symlink** (`writeContentLinks`), use `fs.readlinkSync` to check the current target:

```typescript
private writeContentLinks(): void {
  const target = this.options.config.root;
  const linkPath = path.join(this.projectDir, 'src', 'content', 'docs');
  try {
    const current = fs.readlinkSync(linkPath);
    if (current === target) return;    // already points to the right place
  } catch { /* broken/missing — recreate */ }
  // … existing creation logic …
}
```

**Acceptance criteria:**
- On a second consecutive `start` in the same directory with no file changes, `astro.config.mjs`
  is not rewritten and Astro does not print "Configuration file updated. Restarting..."
- The Vite `deps_temp_*` ENOENT error no longer occurs on subsequent starts.
- On the first `start` (no prior cache) or when content actually changes, all files are
  written normally.
- A race-condition test: start fea-docs, wait for healthy, then start it again immediately.
  The second instance should not trigger a restart cycle in the first.

---

## Ticket F3 (stretch): Emit machine-parseable port line

**File:** `src/cli/commands/start.ts`

**Changes:**

After the real port is known, emit a well-known marker line:

```typescript
const port = await adapter.startDev(config.port);
console.log(`##FEA_DOCS_PORT=${port}##`);
```

The workspace portal can then scan stdout for this prefix instead of parsing the natural-language
`localhost:` line, which may vary by locale or Astro version.

**Acceptance criteria:**
- The line `##FEA_DOCS_PORT=9306##` appears in stdout exactly once after the dev server starts.
- The portal can detect the actual port by searching for `##FEA_DOCS_PORT=` in the process output.

---

## Implementation order

```
F1 ──→ F2 ──→ F3 (stretch)
```

- **F1** (SIGTERM handler) is independent and should be done first — it's a one-liner with
  high impact on process lifecycle.
- **F2** (skip unchanged files) addresses the restart-race and can be done alongside or after F1.
- **F3** (port marker) depends on stable lifecycle; do after F1+F2.

## Verification

1. **F1:** Start fea-docs, wait for healthy, send `kill -TERM <pid>` — verify `ps aux | grep astro`
   shows no survivor.
2. **F2:** Start fea-docs in a directory, wait for healthy, stop it, start it again in the same
   directory — verify log does **not** contain "Configuration file updated. Restarting..."
3. **F2:** Add a new markdown file to the source directory, start fea-docs — verify
   `astro.config.mjs` IS rewritten (content config changed).
4. **Regressions:** `fea-docs start`, `fea-docs build`, `fea-docs publish` all still work.
5. **End-to-end:** Start a docs session via the workspace portal, stop it, start it again —
   session becomes healthy on the first try (no 120 s timeout).
