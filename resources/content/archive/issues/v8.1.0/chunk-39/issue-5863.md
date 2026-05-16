---
id: 5863
title: 'code.LivePreview: run-time code changes no longer get reflected inside the preview'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-09-10T16:02:04Z'
updatedAt: '2024-09-12T01:09:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5863'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T01:09:15Z'
---
# code.LivePreview: run-time code changes no longer get reflected inside the preview

This is related to the caching change of `Neo.setupClass()`, which enables us to use multiple envs of neo on one page.

We need a regex to extract all `className` values inside the editor code and purge the related namespaces to disable the caching.

## Timeline

- 2024-09-10T16:02:04Z @tobiu added the `bug` label
- 2024-09-10T16:02:04Z @tobiu assigned to @tobiu
- 2024-09-10T16:03:24Z @tobiu referenced in commit `a36a929` - "code.LivePreview: run-time code changes no longer get reflected inside the preview #5863"
### @tobiu - 2024-09-12T01:09:15Z

fixed.

- 2024-09-12T01:09:16Z @tobiu closed this issue

