---
title: 'Obsidian Authoring'
---

# Obsidian Authoring with fea-docs

This guide explains how to use Obsidian (or any text editor) as your writing tool while publishing through the `@fea-docs/cli` pipeline.

## Obsidian is an optional editor

Obsidian is a local note-taking application. `fea-docs` does **not** use Obsidian as its build engine or source-of-truth. The publishing pipeline is:

1. **Authoring layer** — write notes in Obsidian, VS Code, or any editor.
2. **Normalization layer** (`@fea-docs/normalizer`) — scans the source vault, applies target filtering, resolves Obsidian syntax, and emits a normalized docs tree.
3. **Rendering layer** (`@fea-docs/cli`) — consumes the normalized docs tree and produces static output.
4. **Publishing layer** — writes normalized docs and static output to configured destinations.

You can use `fea-docs` entirely without Obsidian. The Obsidian compatibility layer is opt-in via `obsidian.enabled: true` in your config.

## Recommended Obsidian settings

If you do use Obsidian, configure it so its behavior aligns with what `@fea-docs/normalizer` supports:

- **Files & Links › New link format**: set to **Relative path from vault root** (or **Shortest path**). Absolute vault paths work; shortest path is resolved by title/alias lookup.
- **Files & Links › Use `[[Wikilinks]]`**: leave enabled. The normalizer resolves wikilinks to standard Markdown links during normalization.
- **Files & Links › Default location for new attachments**: place assets inside your docs root so they are discoverable by the normalizer.
- **Editor › Strict line breaks**: this only affects Obsidian's preview. The normalizer processes raw Markdown and is not affected.

### `.mdx` file caveats

Obsidian does not natively understand `.mdx` files:

- Obsidian will open `.mdx` files as plain text but **will not preview JSX, ESM imports, or expressions**.
- Wikilinks inside `.mdx` files are resolved by the normalizer; Obsidian's own link resolution may show them as broken.
- Install a community plugin such as **MDX** or **Markdown Oxide** if you need richer MDX editing support in Obsidian.
- Standard Markdown syntax inside `.mdx` files is fully supported by both Obsidian and the normalizer.

**Recommendation**: prefer standard Markdown links (`[text](./path)`) in `.mdx` files where possible. Reserve wikilinks for `.md` files where Obsidian's native link handling works well.

## Prefer standard Markdown links

Wikilinks are an Obsidian convenience. The normalizer converts them to standard Markdown links during normalization, but using standard links directly gives you:

- Full compatibility with every Markdown renderer and editor.
- Predictable link resolution without relying on title/alias lookup.
- Easier refactoring when files move.

Use wikilinks when the vault-wide shorthand genuinely saves effort (e.g. `[[Architecture]]` in a large vault). Use standard links when you want portability or exact path control.

## Supported Obsidian syntax

The following syntax is normalized by `@fea-docs/normalizer`:

| Syntax | Output |
|---|---|
| `[[Note]]` | Standard Markdown link to the resolved page route |
| `[[Note\|Alias]]` | Standard Markdown link with alias display text |
| `[[Note#Heading]]` | Markdown link with heading anchor |
| `[[Note#Heading\|Alias]]` | Markdown link with heading anchor and alias text |
| `[[Note#^block-id]]` | Markdown link to the resolved block anchor |
| `![[Note]]` | Bounded embedded note section (Markdown) |
| `![[Note#Heading]]` | Embedded heading section |
| `![[Note#^block-id]]` | Embedded block content |
| `![[image.png]]` | Standard Markdown image |
| `> [!note]` callout | Starlight `:::note` aside |
| `> [!tip]` callout | Starlight `:::tip` aside |
| `> [!info]` callout | Starlight `:::note` aside (info maps to note) |
| `> [!warning]` callout | Starlight `:::caution` aside |
| `> [!danger]` callout | Starlight `:::danger` aside |
| `> [!question]` callout | Starlight `:::note` aside |
| Unknown callout type | Starlight `:::note` aside with a diagnostic |
| Foldable callout `> [!note]+` | Rendered as `<details>/<summary>` accessible collapsible |
| Custom callout title `> [!note] My Title` | Title is preserved |
| Nested callouts | Rendered without corrupting surrounding structure |
| `^block-id` markers | Stable `<span id="block-id">` anchors in output |
| Frontmatter: `publish`, `aliases`, `backlinks`, `pagefind`, `draft` | Normalized and used for filtering and metadata |

## Unsupported Obsidian syntax

The following are **not** supported. Using them will result in a diagnostic (warning in development mode, error in strict mode):

| Feature | Status | Notes |
|---|---|---|
| Dataview queries | Not supported | Dataview is a plugin; arbitrary plugin rendering is out of scope. |
| Embedded search results | Not supported | `query` code blocks and embedded search are plugin-specific. |
| Canvas files | Not supported | `.canvas` files are not Markdown and cannot be normalized. |
| PDF embeds `![[file.pdf]]` | Not supported | Only image/media assets are supported as asset embeds. |
| Obsidian plugin-rendered code blocks | Not supported | Plugin-specific fenced code blocks are left as-is. |
| `publish: true` without a default target | Diagnostic emitted | Configure `obsidian.selectedTarget` or use an explicit target name. |
| Duplicate global aliases | Diagnostic emitted | Ambiguous aliases fail strict builds. |
| Wikilinks inside fenced code or inline code | Not transformed | Wikilink-like text in code is intentionally left untouched. |

## Privacy and security warnings

> **Build filtering is not a substitute for repository privacy.**
>
> The `publish` frontmatter field controls which pages appear in normalized docs and static output. It does **not** make source files private. If your repository is public, every committed file — including drafts, private notes, and assets — is visible to anyone with repository access, regardless of build filtering.
>
> Keep sensitive content out of any publicly accessible repository.

> **Normalized docs are public generated artifacts.**
>
> `@fea-docs/normalizer` emits a normalized docs tree that is published to its own configured destination (e.g. a branch or repo). This tree contains only target-public content, but it is itself a public artifact. Treat it with the same care as your deployed static site. Do not commit normalized docs to a public branch if any of the normalized content should remain private.

## Configuration reference

Add an `obsidian` section to your `fea-docs.config.mjs`:

```js
// fea-docs.config.mjs
export default {
  root: './docs',

  obsidian: {
    enabled: true,

    // Default target when --target is not supplied to CLI commands.
    selectedTarget: 'engineering',

    // Per-feature toggles (all default to true when enabled: true).
    features: {
      wikilinks: true,      // resolve [[wikilinks]] to Markdown links
      embeds: true,         // expand ![[embeds]]
      callouts: true,       // normalize > [!callout] syntax
      backlinks: true,      // generate backlink data
      graph: true,          // emit fea-docs.graph.json
      targetAllowlisting: true, // require explicit publish: <target> frontmatter
    },

    // Fail strict diagnostics (overrides top-level strict flag for Obsidian builds).
    strict: false,

    // Additional glob patterns to exclude from discovery.
    ignorePaths: ['**/drafts/**'],

    // Asset directories that are always included regardless of references.
    publicAssetDirs: ['assets/public'],

    targets: {
      engineering: {
        label: 'Engineering',
        normalizedDocs: {
          repo: '.',
          branch: 'generated/engineering-docs',
          path: 'docs',
        },
        staticOutput: {
          repo: '.',
          branch: 'generated/engineering-site',
          path: '.',
        },
      },
      recipes: {
        label: 'Recipes',
        normalizedDocs: {
          repo: '.',
          branch: 'generated/recipes-docs',
          path: 'docs',
        },
        staticOutput: {
          repo: '.',
          branch: 'generated/recipes-site',
          path: '.',
        },
      },
    },
  },
};
```

### Config fields

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Enable Obsidian-compatible vault normalization. |
| `selectedTarget` | `string` | — | Default target when `--target` is not supplied. |
| `features.wikilinks` | `boolean` | `true` | Resolve `[[wikilinks]]` to standard Markdown links. |
| `features.embeds` | `boolean` | `true` | Expand `![[embeds]]` (note, heading, block, asset). |
| `features.callouts` | `boolean` | `true` | Normalize `> [!callout]` syntax. |
| `features.backlinks` | `boolean` | `true` | Generate and render backlink data. |
| `features.graph` | `boolean` | `true` | Emit graph data and enable the generated graph page/sidebar entry. When `false`, graph UI code is not generated or loaded. |
| `features.targetAllowlisting` | `boolean` | `true` | Require explicit `publish: <target>` frontmatter. |
| `strict` | `boolean` | `false` | Fail on strict diagnostics. |
| `ignorePaths` | `string[]` | `[]` | Additional globs to exclude during discovery. |
| `publicAssetDirs` | `string[]` | `[]` | Asset directories always included regardless of references. |
| `targets` | `Record<string, PublishTargetConfig>` | `{}` | Publishing target definitions. |
| `targets[id].normalizedDocs` | `{ repo, branch, path }` | — | Destination for normalized docs artifact. |
| `targets[id].staticOutput` | `{ repo, branch, path }` | — | Destination for static site output. |

### Default behavior without Obsidian compatibility

When `obsidian.enabled` is not set (or set to `false`), the `fea-docs` pipeline behaves exactly as it did before the Obsidian compatibility layer was added:

- No wikilink resolution.
- No callout normalization.
- No embed expansion.
- No target filtering.
- All `.md` and `.mdx` files under `root` are served directly.

Existing `fea-docs` usage continues to work with no config changes.

### Graph UI behavior

When `features.graph` is enabled, `@fea-docs/cli` generates a standalone Knowledge Graph page. Its client-side script is scoped to that page only, so regular documentation pages do not load graph UI code. The graph page also includes a keyboard-focusable canvas and a non-visual fallback table listing pages and connections.

Set `obsidian.features.graph: false` to omit the graph page and sidebar link entirely.

## Page frontmatter

| Field | Type | Description |
|---|---|---|
| `title` | `string` | Page title. Falls back to first H1, then filename. |
| `publish` | `string \| string[] \| false` | Publishing targets. E.g. `publish: engineering` or `publish: [engineering, recipes]`. Nothing is public by default. |
| `aliases` | `string[]` | Global vault-wide alternate names for wikilink resolution. |
| `slug` | `string` | Explicit URL slug overriding the filename-derived route. |
| `draft` | `boolean` | Exclude from production builds. |
| `backlinks` | `boolean` | Render incoming backlinks on this page. |
| `pagefind` | `boolean` | Include (`true`, default) or exclude (`false`) from search. |

## CLI commands

```sh
# Normalize one target
fea-docs normalize --target engineering

# Normalize using the configured selectedTarget
fea-docs normalize

# Serve normalized docs locally
fea-docs start --root .fea-docs/normalized/engineering

# Build static output
fea-docs build --root .fea-docs/normalized/engineering

# Publish one target (normalize + build + write to destination)
fea-docs publish --target engineering

# Publish all configured targets
fea-docs publish --all
```
