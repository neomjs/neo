---
name: "Off-Main-Thread Execution"
tier: 1
uniqueToNeo: true
tags:
  - "architecture"
  - "workers"
  - "performance"
aliases:
  - "off the main thread"
  - "OMT"
verifiedAt: null
---

Application business logic runs inside a dedicated App Worker, not on the main thread. The main thread only receives minimal DOM-delta payloads, eliminating jank and enabling true parallelism.