---
name: "Multi-Threading Architecture"
tier: 1
uniqueToNeo: true
tags:
  - "architecture"
  - "workers"
  - "performance"
aliases:
  - "multi-worker architecture"
  - "worker-based threading"
verifiedAt: null
---

Neo.mjs distributes application logic across dedicated Web Workers (App, VDom, Data, Canvas, Task), keeping the main thread reserved exclusively for DOM updates. This is the platform's defining architectural decision.