---
name: "JSON-First VDOM Protocol"
tier: 1
uniqueToNeo: true
tags:
  - "architecture"
  - "vdom"
  - "rendering"
aliases:
  - "JSON VDOM"
  - "JSON-based virtual DOM"
verifiedAt: null
---

UI descriptions are plain JSON objects, not a compiled template language. Components define their VDOM as nested JSON structures, enabling programmatic manipulation, serialization, and cross-thread transfer without parsing.