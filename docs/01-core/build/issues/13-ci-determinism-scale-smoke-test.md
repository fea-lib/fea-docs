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