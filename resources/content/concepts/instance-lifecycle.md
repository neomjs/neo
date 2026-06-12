---
name: "Instance Lifecycle"
tier: 1
uniqueToNeo: true
tags:
  - "class-system"
  - "lifecycle"
verifiedAt: null
---

The lifecycle of a Neo.mjs instance: construct() → config application → onConstructed() → initAsync() (if defined). The constructor phase is synchronous; initAsync() provides a hook for async initialization that runs after the instance is fully configured.