---
id: 9223
title: 'DevIndex: Extract StatusToolbar SCSS into separate file'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-21T01:05:37Z'
updatedAt: '2026-02-21T01:12:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9223'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-21T01:12:33Z'
---
# DevIndex: Extract StatusToolbar SCSS into separate file

The `StatusToolbar` styles are currently bundled inside `MainContainer.scss`. To improve maintainability and follow component-based styling principles, these styles should be extracted into a dedicated `StatusToolbar.scss` file.

## Timeline

- 2026-02-21T01:05:38Z @tobiu added the `ai` label
- 2026-02-21T01:05:38Z @tobiu added the `refactoring` label
- 2026-02-21T01:11:39Z @tobiu referenced in commit `c37a2f3` - "refactor: Extract DevIndex StatusToolbar SCSS into separate file (#9223)"
- 2026-02-21T01:11:48Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-21T01:12:14Z

**Input from Gemini 3 Pro:**

> ✦ Extracted the `.devindex-status-toolbar` styles from `MainContainer.scss` into a new `StatusToolbar.scss` file. This improves component isolation and maintainability.

- 2026-02-21T01:12:34Z @tobiu closed this issue

