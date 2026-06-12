---
name: "Zero-Build Development Mode"
tier: 1
uniqueToNeo: true
tags:
  - "architecture"
  - "development"
verifiedAt: null
---

In development mode, Neo.mjs runs directly from native ES modules — no bundler, no transpiler, no build step. The browser imports source files directly. Production builds use webpack for optimization but are not required during development.