---
name: "VDOM as IPC Layer"
tier: 1
uniqueToNeo: true
tags:
  - "architecture"
  - "vdom"
  - "workers"
verifiedAt: null
---

The JSON-based virtual DOM doubles as the inter-process communication format between the App Worker and VDom Worker. State changes are expressed as VDOM mutations, serialized to postMessage, then delta-computed in the VDom Worker.