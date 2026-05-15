---
name: "Lifecycle Hooks (beforeSet / afterSet / beforeGet)"
tier: 2
uniqueToNeo: true
tags:
  - "reactivity"
  - "config"
  - "lifecycle"
verifiedAt: null
---

Reactive configs support three lifecycle hooks: beforeSet (validation/transformation), afterSet (side effects like VDOM updates), and beforeGet (lazy computation). The naming convention is method-level: beforeSetMyConfig(), afterSetMyConfig().