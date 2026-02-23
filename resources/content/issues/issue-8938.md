---
id: 8938
title: 'Feat: UI Filtering Logic'
state: CLOSED
labels:
  - enhancement
  - design
assignees:
  - tobiu
createdAt: '2026-02-01T16:43:35Z'
updatedAt: '2026-02-23T16:12:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8938'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-23T16:12:08Z'
---
# Feat: UI Filtering Logic

This task focuses on connecting the UI Controls to the Grid's Store to enable real-time filtering.

### Requirements
1.  **Search Filter:** Connect the "Search User" text field in `ControlsContainer` to filter the store by `login` or `name`.
2.  **Activity Filter (Logic):** Add a filter logic to the Store to filter users based on contribution count (e.g., >1000 total).
3.  **UI Updates:** Update the "Visible: X" label when filters change.

### Acceptance Criteria
- Typing in the search box updates the grid in real-time (buffered).
- The row count label updates accurately.


## Timeline

- 2026-02-01T16:43:36Z @tobiu added the `enhancement` label
- 2026-02-01T16:43:36Z @tobiu added the `design` label
- 2026-02-01T16:43:54Z @tobiu added parent issue #8930
- 2026-02-01T16:44:49Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-23T16:12:08Z

already resolved.

- 2026-02-23T16:12:08Z @tobiu closed this issue

