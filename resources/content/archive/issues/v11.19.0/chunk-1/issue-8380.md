---
id: 8380
title: Fix json5 rendering in NeuralLink guide
state: CLOSED
labels:
  - bug
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-07T13:55:56Z'
updatedAt: '2026-01-07T13:58:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8380'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T13:58:57Z'
---
# Fix json5 rendering in NeuralLink guide

The `json5` language tag is not supported by `Neo.component.Markdown`, causing the code block to render without highlighting. 
Replacing it with `javascript` allows for syntax highlighting of JSON with comments.

## Timeline

- 2026-01-07T13:55:57Z @tobiu added the `bug` label
- 2026-01-07T13:55:57Z @tobiu added the `documentation` label
- 2026-01-07T13:55:57Z @tobiu added the `ai` label
- 2026-01-07T13:56:15Z @tobiu assigned to @tobiu
- 2026-01-07T13:57:03Z @tobiu referenced in commit `7082af9` - "docs: use javascript instead of json5 for highlighting #8380"
- 2026-01-07T13:58:57Z @tobiu closed this issue

