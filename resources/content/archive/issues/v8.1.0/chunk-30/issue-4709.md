---
id: 4709
title: 'util.Logger: logError() is not able to properly parse specific scenarios'
state: CLOSED
labels:
  - bug
assignees:
  - Dinkh
createdAt: '2023-08-14T11:44:10Z'
updatedAt: '2024-07-29T19:26:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4709'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-29T19:26:43Z'
---
# util.Logger: logError() is not able to properly parse specific scenarios

I added `console.log(args)` into `logError()` to see the given input.

![Screenshot 2023-08-14 at 13 39 14](https://github.com/neomjs/neo/assets/1177434/9a156abc-8720-4556-9678-a65ce35a2fa9)


## Timeline

- 2023-08-14T11:44:10Z @tobiu added the `bug` label
- 2023-08-14T11:44:10Z @tobiu assigned to @Dinkh
### @tobiu - 2023-08-14T11:54:08Z

to reproduce this one, you can just add the following into any cmp, assuming a view controller exists somewhere:
```
domListeners: {
    click: 'notExistingFn'
}
```

### @Dinkh - 2024-07-29T19:26:43Z

Tested in portal app, by adding the example.
Fixed

- 2024-07-29T19:26:43Z @Dinkh closed this issue

