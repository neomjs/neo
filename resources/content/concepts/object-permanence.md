---
name: "Object Permanence"
tier: 1
uniqueToNeo: true
tags:
  - "architecture"
  - "components"
verifiedAt: null
---

Component instances persist in the App Worker's memory regardless of DOM visibility. Removing a component from a view does not destroy it — it can be re-inserted elsewhere, even in a different window, with its full state intact.