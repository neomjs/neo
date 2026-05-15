---
name: "RPC Layer"
tier: 2
uniqueToNeo: true
tags:
  - "architecture"
  - "workers"
  - "rpc"
verifiedAt: null
---

A transparent promise-based Remote Procedure Call system that enables cross-worker method invocation. The App Worker can call methods on components in the VDom Worker as if they were local, with the framework handling serialization and routing.