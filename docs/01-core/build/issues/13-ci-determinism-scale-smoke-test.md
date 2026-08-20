---
title: "13 — CI determinism & scale smoke-test"
---

# 13 — CI determinism & scale smoke-test

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §8, §12

**What to build:** Verify that `fea-docs build` is deterministic and non-interactive in a CI runner (no TTY, no prompts, stable output artifact) with meaningful exit codes. Run a scale smoke-test at 1000+ documents to confirm comfortable build and fast client-side query performance on a typical laptop. Judge whether dev-server search cost is acceptable — this gates the §8 dev-search nice-to-have (search on `dev`, not only production builds).

**Blocked by:** 11 — Search index & widget; 12 — `--strict` & remaining failsafes

**Status:** ready-for-agent

- [ ] `fea-docs build` verified deterministic and non-interactive in a CI/CD runner
- [ ] Scale smoke-test at 1000+ docs on a typical laptop passes (build + client-side query)
- [ ] Dev-server search cost assessed against acceptable thresholds
- [ ] Decision recorded on whether the §8 dev-search nice-to-have ships

## Requirements & constraints

**CI determinism — PRD §12**
- `fea-docs build` is **deterministic**: non-interactive, **no TTY or prompts required**, emits a **stable output artifact**; works in GitHub Actions, GitLab CI, or any runner (PRD §12, §1).
- Meaningful exit codes (hard failures non-zero; warning-only runs exit 0 — ticket 12) must hold in a runner (no local interactive state).
- The config's **conditional `base` path supports deploy/CI environments** (local/dev/preview/prod), not merely a single prod flag (PRD §12).
- Determinism conventions already concrete: byte-order discovery, `\n` emissions, thrown hard errors (CONVENTIONS.md).

**Scale/perf — PRD §8**
- **1000+ documents** handled comfortably on a typical laptop — both build and the client-side query over the downloaded search index. Exact build-time budgets are deferred here (PRD §8) — this ticket may set them as *acceptance thresholds* to smoke-test against.
- **Dev-search nice-to-have**: search functional on the **dev** server (not only production builds) **if** the index/rebuild cost is small enough; **the scale smoke-test judges** against acceptable thresholds. This gates that decision.

**Gates (blocking edges)**
- Blocked by 11 (search index build + widget) and 12 (strict/hard-failure semantics), because both are measured here.

## Open decisions

1. **Acceptance thresholds.** Concrete budgets for the 1000+ smoke-test: build wall-time ceiling, emitted bytes, client query latency (and on what machine/network model). Decide them here so the test has pass/fail bounds, or confirm this ticket only *records* them post-smoke (deferred to measurement).
2. **Harness shape.** A CI fixture (GitHub Actions workflow + local script) generating 1000+ docs, engineered to include: mixed `.md`/`.mdx`, nested dirs, assets, links, a frontmatter `title` subset. Decide whether it uses the real CLI binary or calls `runBuild` directly, and how randomness is blocked (determinism needs seeded/fixed input).
3. **Determinism surface.** Nondeterministic inputs to audit: config (09) reads of env/time, remote theme fetch (10), "any import/export ordering", fs walk ordering — decide what a "stable artifact" means (byte-for-byte equality across two runs of identical input) and which stages are in scope.
4. **Dev-search gate.** How the smoke-test data answers "is the dev index/rebuild cost small enough" — measure rebuild-on-save cost and widget index load on dev at 1000+; decide the pass/fail threshold and where the decision gets recorded (ticket 11/13) so the nice-to-have either ships or is recorded as deferred.
5. **Config-bearing CI builds.** Whether the smoke-test covers a config with a conditional `base` per environment (since §12 requires deploy/CI base support) — and the artifact stability under those builds.