---
id: 7109
title: 'docs: Update "Config System Deep Dive" for v10 reactivity'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-24T15:38:04Z'
updatedAt: '2025-07-28T10:35:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7109'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-28T10:35:57Z'
---
# docs: Update "Config System Deep Dive" for v10 reactivity

**Reported by:** @tobiu on 2025-07-24

The "Config System Deep Dive" guide is critically outdated. It only describes the classic, imperative "push" reactivity system and is completely missing the new declarative "pull" system that powers v10 functional components.

This ticket is to update the document to provide a complete picture of the v10 two-tier reactivity model.

### Tasks
- Add a major new section explaining the declarative "pull" tier of the reactivity system.
- This section must detail the roles of `Neo.core.Config`, `Neo.core.Effect`, and `EffectManager`.
- It must explain how the `createVdom` function in a functional component acts as a master `Effect`.
- Crucially, it needs to explain how the two tiers are bridged: how a single config setter both triggers the classic `afterSet` hook and updates the new `Neo.core.Config` atom.
- The existing content on the "push" system (`set`, `processConfigs`) should be preserved and framed as the first tier of the hybrid system.

