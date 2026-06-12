---
name: "Canvas Architecture (Zero-Allocation)"
tier: 2
uniqueToNeo: true
tags:
  - "canvas"
  - "performance"
  - "workers"
verifiedAt: null
---

OffscreenCanvas rendering runs in a dedicated Canvas Worker, achieving zero main-thread allocation for complex visualizations. The canvas uses a scene-graph model with JSON-described render instructions.