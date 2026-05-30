---
id: 4305
title: 'form.field.Text: afterSetRequired(), afterSetValue() => only set silentVdomUpdate to false in case it was not true outside of this scope'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-04-20T12:38:49Z'
updatedAt: '2023-04-20T16:06:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4305'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-04-20T16:06:28Z'
---
# form.field.Text: afterSetRequired(), afterSetValue() => only set silentVdomUpdate to false in case it was not true outside of this scope

example: bulk config updates where we want to prevent updates until all of them are done.

setting the config to false earlier will result in multiple engine calls.

## Timeline

- 2023-04-20T12:38:49Z @tobiu added the `bug` label
- 2023-04-20T12:38:49Z @tobiu assigned to @tobiu
### @tobiu - 2023-04-20T13:30:16Z

actually we can and should resolve this in a more generic way, using `beforeSetVdomUpdate()` to change the value into an integer. each additional set to true increases it further, zero enables updates again.

```
this.silentVdomUpdate = true; // 1
this.silentVdomUpdate = true; // 2

this.silentVdomUpdate = false; // 1 => not re-enabling updates
this.silentVdomUpdate = false; // 0 => updates enabled again
```

- 2023-04-20T16:06:24Z @tobiu referenced in commit `e45ad78` - "#4305 silentVdomUpdate => silentVdomUpdate_"
- 2023-04-20T16:06:28Z @tobiu closed this issue

