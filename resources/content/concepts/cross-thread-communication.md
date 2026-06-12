---
name: "Cross-Thread Communication"
tier: 1
uniqueToNeo: true
tags:
  - "architecture"
  - "workers"
  - "rpc"
verifiedAt: null
---

Workers communicate via structured postMessage RPC calls. The framework provides a transparent promise-based API that makes cross-thread calls look like synchronous local calls, hiding the async boundary.