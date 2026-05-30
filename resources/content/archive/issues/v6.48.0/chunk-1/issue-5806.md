---
id: 5806
title: 'code.LivePreview: we must use the return value of Neo.setupClass()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-19T17:38:22Z'
updatedAt: '2024-08-19T17:40:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5806'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-19T17:38:51Z'
---
# code.LivePreview: we must use the return value of Neo.setupClass()

related to the changes which enable us to use multiple neo versions & envs in parallel.

`setupClass()` will no longer parse input with the same `className` multiple times, but return the first found match instead.

this also affects our live previews: while the first switch to the preview mode did still work fine. switching back & forth did not:
![Screenshot 2024-08-19 at 19 35 25](https://github.com/user-attachments/assets/3b6b95a5-d1e8-444e-a16a-20096f0a5600)


## Timeline

- 2024-08-19T17:38:22Z @tobiu added the `enhancement` label
- 2024-08-19T17:38:22Z @tobiu assigned to @tobiu
- 2024-08-19T17:38:43Z @tobiu referenced in commit `63750ab` - "code.LivePreview: we must use the return value of Neo.setupClass() #5806"
- 2024-08-19T17:38:51Z @tobiu closed this issue
### @tobiu - 2024-08-19T17:40:14Z

@maxrahder: fyi for future live previews or in case you are wondering what happened.


