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
blockedBy: []
blocking: []
closedAt: '2025-07-28T10:35:57Z'
---
# docs: Update "Config System Deep Dive" for v10 reactivity

The "Config System Deep Dive" guide is critically outdated. It only describes the classic, imperative "push" reactivity system and is completely missing the new declarative "pull" system that powers v10 functional components.

This ticket is to update the document to provide a complete picture of the v10 two-tier reactivity model.

### Tasks
- Add a major new section explaining the declarative "pull" tier of the reactivity system.
- This section must detail the roles of `Neo.core.Config`, `Neo.core.Effect`, and `EffectManager`.
- It must explain how the `createVdom` function in a functional component acts as a master `Effect`.
- Crucially, it needs to explain how the two tiers are bridged: how a single config setter both triggers the classic `afterSet` hook and updates the new `Neo.core.Config` atom.
- The existing content on the "push" system (`set`, `processConfigs`) should be preserved and framed as the first tier of the hybrid system.

## Timeline

- 2025-07-24T15:38:04Z @tobiu assigned to @tobiu
- 2025-07-24T15:38:06Z @tobiu added the `enhancement` label
- 2025-07-28T10:35:15Z @tobiu referenced in commit `d2d3b0c` - "docs: Update "Config System Deep Dive" for v10 reactivity #7109"
- 2025-07-28T10:35:53Z @tobiu referenced in commit `817b172` - "#7109 code block => readonly"
- 2025-07-28T10:35:58Z @tobiu closed this issue

