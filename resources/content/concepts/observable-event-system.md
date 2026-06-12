---
name: "Observable Mixin & Event System"
tier: 2
uniqueToNeo: false
tags:
  - "events"
  - "mixins"
verifiedAt: null
---

The Observable mixin provides a DOM-style event system for non-DOM objects. Classes marked as static observable = true gain addListener/fireEvent/on APIs. Event delegation in the VDOM maps DOM events to component methods.