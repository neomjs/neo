---
name: "Worker Isolation"
tier: 1
uniqueToNeo: true
tags:
  - "architecture"
  - "workers"
verifiedAt: null
---

Each worker type (App, VDom, Data, Canvas, Task) has a dedicated responsibility. App Workers run component logic; VDom Workers compute deltas; Data Workers handle network I/O; Canvas Workers handle OffscreenCanvas rendering.