---
id: 5482
title: 'LivePreview: closing a detached window sometimes gets an error'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-06-24T20:27:44Z'
updatedAt: '2024-06-26T07:53:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5482'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-26T07:53:34Z'
---
# LivePreview: closing a detached window sometimes gets an error

![Screenshot 2024-06-24 at 22 25 48](https://github.com/neomjs/neo/assets/1177434/633ba561-a68e-45d4-93ab-8b50ed076d01)

might be a bigger issue: `revertFocus()` & `focus()` could not be aware about different windows or a focus call wants to enter a no longer existing window.

## Timeline

- 2024-06-24T20:27:44Z @tobiu added the `bug` label
- 2024-06-24T20:27:44Z @tobiu assigned to @tobiu
- 2024-06-26T07:51:11Z @tobiu referenced in commit `7180539` - "LivePreview: closing a detached window sometimes gets an error #5482"
### @tobiu - 2024-06-26T07:53:34Z

while there was an issue with the focus remote call (passing id instead of window id, i added explicit port checks into `worker.Base`. if a windowId gets passed and no port it found, no message will get send. accordingly: `promiseMessage()` will directly trigger `reject()` if no message was sent.

- 2024-06-26T07:53:34Z @tobiu closed this issue

