---
name: "Asymmetric VDOM Updates"
tier: 1
uniqueToNeo: true
tags:
  - "architecture"
  - "vdom"
  - "performance"
verifiedAt: null
---

Components can surgically update individual VDOM nodes without re-rendering the full tree. Using vdom path accessors, a single property change can target a specific nested element, enabling fine-grained reactivity.