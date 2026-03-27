---
id: 9568
title: Fix code examples in DataPipelines.md guide
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-03-27T10:14:40Z'
updatedAt: '2026-03-27T10:20:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9568'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T10:20:56Z'
---
# Fix code examples in DataPipelines.md guide

The `DataPipelines.md` guide contains code examples that fail to execute in the LivePreview environment. Specifically, they miss the required `Neo.setupClass()` re-assignment for newly defined classes (Models, Stores, and Containers) and improperly use `export default` for the main view class. This issue will fix these blocks to align with the framework's LivePreview execution standards.

## Timeline

- 2026-03-27T10:14:41Z @tobiu added the `documentation` label
- 2026-03-27T10:14:41Z @tobiu added the `ai` label
- 2026-03-27T10:20:49Z @tobiu referenced in commit `e6fd772` - "docs: Fix code examples in DataPipelines.md guide (#9568)

- Added Neo.setupClass() assignments to tutorial code blocks
- Created dummy users.json data set for the live preview"
- 2026-03-27T10:20:51Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-27T10:20:54Z

Fixed the code examples by adding `Neo.setupClass()` re-assignments, removing `export default`, and created a dummy `users.json` to serve the live preview fetch.

- 2026-03-27T10:20:56Z @tobiu closed this issue

