---
id: 7105
title: 'docs: Enhance NeoVsReact.md comparison'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-24T15:16:44Z'
updatedAt: '2025-10-22T22:58:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7105'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-24T15:17:14Z'
---
# docs: Enhance NeoVsReact.md comparison

This ticket covers a series of enhancements to the `learn/comparisons/NeoVsReact.md` document to provide a more detailed and accurate comparison against React, incorporating the latest v10 architectural insights.

### `learn/comparisons/NeoVsReact.md` Enhancements
- Restructured the document to provide a more in-depth analysis.
- Added a dedicated section on React's "Inverted Reactivity Model" and contrasted it with Neo.mjs's "Direct & Granular" approach.
- Included a side-by-side code example to visually demonstrate the "memoization tax" in React versus the zero-optimization-needed model in Neo.mjs.
- Added a section comparing React's ephemeral component lifecycle with Neo.mjs's stable, persistent instances and rich lifecycle hooks (`initAsync`, `afterSetMounted`).
- Detailed the architectural advantages of Neo.mjs's `StateProvider` for surgical state subscriptions over React's Context API.

## Timeline

- 2025-07-24T15:16:44Z @tobiu assigned to @tobiu
- 2025-07-24T15:16:45Z @tobiu added the `enhancement` label
- 2025-07-24T15:17:05Z @tobiu referenced in commit `7969234` - "docs: Enhance NeoVsReact.md comparison #7105"
- 2025-07-24T15:17:14Z @tobiu closed this issue

