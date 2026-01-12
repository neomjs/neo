---
id: 6599
title: 'state.Provider: onDataPropertyChange() => add a check to not enter resolveFormulas() in case there are no formulas'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-03-30T19:22:50Z'
updatedAt: '2025-03-30T19:23:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6599'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-30T19:23:59Z'
---
# state.Provider: onDataPropertyChange() => add a check to not enter resolveFormulas() in case there are no formulas

minor run-time improvement, in case `onDataPropertyChange()` does get called very often.

## Timeline

- 2025-03-30T19:22:50Z @tobiu added the `enhancement` label
- 2025-03-30T19:23:47Z @tobiu referenced in commit `c5e0e4c` - "state.Provider: onDataPropertyChange() => add a check to not enter resolveFormulas() in case there are no formulas #6599"
- 2025-03-30T19:23:59Z @tobiu closed this issue

