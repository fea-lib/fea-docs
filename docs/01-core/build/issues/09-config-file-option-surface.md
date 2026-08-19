---
title: "09 — Config file & option surface"
---

# 09 — Config file & option surface

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §9

**What to build:** A config file, `fea-docs.config.js` (JavaScript module), discovered in the execution directory only (no parent-directory scanning). The tool is 0-config by default — config appears only when a need forces it. Every option exists both as a CLI flag and as a config entry (port, output, strict, base, theme, config path), with precedence CLI flag > config file > built-in default, and every option has a default value. The config's first citizen is a conditional `base` path (per environment: local/dev/preview/prod) so the site can be deployed under a subpath (e.g. GitHub Pages project sites).

**Blocked by:** 01 — CLI scaffold & build basics

**Status:** ready-for-agent

- [ ] `fea-docs.config.js` discovered in the execution directory only (no parent scanning)
- [ ] 0-config default — tool works with no config file present
- [ ] Every option expressible both as a CLI flag and a config entry (port, output, strict, base, theme, config path)
- [ ] Precedence: CLI flag > config file > built-in default
- [ ] Every option has a default value (nothing mandatory)
- [ ] Config supports a conditional `base` path, including a deploy/CI environment (local/dev/preview/prod)