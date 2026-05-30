---
id: 4061
title: 'form.field.Radio: keynav to navigate through different radio group items no longer works'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-02-15T15:05:43Z'
updatedAt: '2023-02-15T15:07:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4061'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-15T15:07:58Z'
---
# form.field.Radio: keynav to navigate through different radio group items no longer works

it looks like Chromium does not support it, in case the input node is using `display: none`. changing it to `width: 0` resolves this for me.

## Timeline

- 2023-02-15T15:05:43Z @tobiu added the `bug` label
- 2023-02-15T15:05:43Z @tobiu assigned to @tobiu
- 2023-02-15T15:07:56Z @tobiu referenced in commit `08b316c` - "form.field.Radio: keynav to navigate through different radio group items no longer works #4061"
- 2023-02-15T15:07:58Z @tobiu closed this issue

