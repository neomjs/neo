---
name: "Native Edge Graph"
tier: 2
uniqueToNeo: true
tags:
  - "agent-os"
  - "graph"
  - "memory"
verifiedAt: null
---

A SQLite-backed knowledge graph maintained by the Memory Core. Stores typed nodes (CLASS, METHOD, FILE, ISSUE, CONCEPT) with weighted edges. Supports Hebbian decay, topological traversal, and orphan pruning.