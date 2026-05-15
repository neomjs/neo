---
name: "VDOM Teleportation"
tier: 2
uniqueToNeo: true
tags:
  - "vdom"
  - "multi-window"
verifiedAt: null
---

Components can be moved between windows at runtime by serializing their VDOM JSON to a different browser context. The component's state persists in the App Worker — only the rendering target changes.