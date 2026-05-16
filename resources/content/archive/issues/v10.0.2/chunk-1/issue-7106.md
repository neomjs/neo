---
id: 7106
title: 'docs: Enhance NeoVsVue.md comparison'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-24T15:21:06Z'
updatedAt: '2025-10-22T22:58:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7106'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-24T15:21:37Z'
---
# docs: Enhance NeoVsVue.md comparison

This ticket covers a series of enhancements to the `learn/comparisons/NeoVsVue.md` document to provide a more detailed and nuanced comparison against Vue.js, incorporating the latest v10 architectural insights.

### `learn/comparisons/NeoVsVue.md` Enhancements
- Restructured the document to acknowledge Vue's excellent main-thread reactivity while highlighting Neo.mjs's architectural differences.
- Introduced the "Backend-in-the-Browser" analogy to explain the multi-threaded architecture.
- Added a dedicated section comparing Vue's pure "pull" reactivity with Neo.mjs's hybrid "push/pull" system, explaining the benefits of `afterSet` hooks for complex logic.
- Contrasted Vue's lifecycle with Neo.mjs's stable and persistent lifecycle, focusing on `initAsync` and multi-window capabilities as key differentiators for advanced applications.

## Timeline

- 2025-07-24T15:21:06Z @tobiu assigned to @tobiu
- 2025-07-24T15:21:07Z @tobiu added the `enhancement` label
- 2025-07-24T15:21:29Z @tobiu referenced in commit `5a8ca6e` - "docs: Enhance NeoVsVue.md comparison #7106"
- 2025-07-24T15:21:37Z @tobiu closed this issue

