---
id: 8508
title: Implement Text Truncation for Portal TreeList
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T16:16:18Z'
updatedAt: '2026-01-10T16:26:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8508'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T16:26:47Z'
---
# Implement Text Truncation for Portal TreeList

Implement CSS text truncation for `TreeList` items in the Portal app.
The calculated titles (e.g., ID + Date) can exceed the sidebar width.
We need to apply `text-overflow: ellipsis`, `overflow: hidden`, and `white-space: nowrap` to the item content.
Target file: `resources/scss/src/apps/portal/shared/content/TreeList.scss`.
Focus on leaf nodes, but ensure folders also handle overflow gracefully if possible.

## Timeline

- 2026-01-10T16:16:20Z @tobiu added the `enhancement` label
- 2026-01-10T16:16:20Z @tobiu added the `design` label
- 2026-01-10T16:16:20Z @tobiu added the `ai` label
- 2026-01-10T16:25:54Z @tobiu referenced in commit `bfb57d2` - "enhancement: Add text truncation and right padding to Portal TreeList items (#8508)"
- 2026-01-10T16:26:13Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T16:26:24Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the CSS text truncation for `TreeList` items by adding `flex: 1`, `overflow: hidden`, `text-overflow: ellipsis`, and `white-space: nowrap` to `.neo-list-item-content`. I also added `3px` right padding to nested list items to ensure text doesn't hit the edge visually. The changes were applied to `resources/scss/src/apps/portal/shared/content/TreeList.scss`.

- 2026-01-10T16:26:48Z @tobiu closed this issue

