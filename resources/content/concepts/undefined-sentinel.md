---
name: "The undefined Sentinel Value"
tier: 2
uniqueToNeo: true
tags:
  - "reactivity"
  - "config"
verifiedAt: null
---

When a reactive config is set to the literal value undefined, Neo.mjs interprets this as 'do not apply this config'. This allows subclasses to selectively opt out of inherited default values without triggering afterSet hooks.