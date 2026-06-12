---
name: "Push-Based Reactivity (Config System)"
tier: 1
uniqueToNeo: true
tags:
  - "reactivity"
  - "config"
  - "lifecycle"
verifiedAt: null
---

Reactive properties defined with a trailing underscore (e.g., myConfig_) trigger explicit lifecycle hooks (beforeSet, afterSet, beforeGet) when changed. This is the primary reactivity model, providing full control over change propagation.