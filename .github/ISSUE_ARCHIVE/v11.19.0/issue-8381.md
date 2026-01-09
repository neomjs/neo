---
id: 8381
title: Fix json code block highlighting in MainThreadAddons guide
state: CLOSED
labels:
  - bug
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-07T13:58:54Z'
updatedAt: '2026-01-07T14:04:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8381'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T14:04:51Z'
---
# Fix json code block highlighting in MainThreadAddons guide

In `learn/guides/fundamentals/MainThreadAddons.md`, there is a `json` code block that uses comments (`//`). This causes rendering issues with the custom Markdown component.
It should be updated to `javascript` to support comments and ensure correct highlighting.

## Activity Log

- 2026-01-07 @tobiu added the `bug` label
- 2026-01-07 @tobiu added the `documentation` label
- 2026-01-07 @tobiu added the `ai` label
- 2026-01-07 @tobiu assigned to @tobiu
- 2026-01-07 @tobiu referenced in commit `9b7b3c3` - "docs: use javascript instead of json for highlighting in blog posts #8381"
- 2026-01-07 @tobiu referenced in commit `1cd45c8` - "Fix json code block highlighting in MainThreadAddons guide #8381"
- 2026-01-07 @tobiu closed this issue

