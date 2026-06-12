---
name: "Mixin Architecture"
tier: 2
uniqueToNeo: true
tags:
  - "class-system"
  - "inheritance"
verifiedAt: null
---

Neo.mjs supports multiple inheritance via mixins. Mixins are applied during setupClass(), copying methods and reactive configs from mixin prototypes to the target class. Conflict detection prevents silent overwrites.