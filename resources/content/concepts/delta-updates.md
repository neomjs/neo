---
name: "Delta Update Pipeline"
tier: 1
uniqueToNeo: true
tags:
  - "architecture"
  - "vdom"
  - "performance"
verifiedAt: null
---

The VDom Worker compares old and new VDOM trees, computes a minimal set of DOM operations (deltas), and sends only those operations to the main thread. This minimizes main-thread work and eliminates full re-renders.