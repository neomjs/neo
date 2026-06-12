---
name: "Reactive Configs (Trailing Underscore)"
tier: 2
uniqueToNeo: true
tags:
  - "reactivity"
  - "config"
aliases:
  - "trailing underscore"
  - "trailing underscore convention"
  - "reactive config syntax"
verifiedAt: null
---

Properties declared with a trailing underscore in the static config block (e.g., text_: 'Hello') automatically generate getter/setter pairs with beforeSet/afterSet hooks. The underscore is a compile-time signal to Neo.setupClass().