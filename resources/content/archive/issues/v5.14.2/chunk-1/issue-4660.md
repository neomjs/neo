---
id: 4660
title: 'core.Base: timeout()'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-08-06T16:05:41Z'
updatedAt: '2023-08-06T16:35:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4660'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-06T16:35:07Z'
---
# core.Base: timeout()

We have many classes which are using either `Neo.timeout()` or `setTimeout()`. Since instances can literally get destroyed at any moment, it would be nice if timeout callbacks would automatically get removed (via `clearTimeout()`).

To resolve this:
- core.Base needs a new `timeout()` method
- once called it should store the returned `timeoutId` inside an instance based array
- once a timeout is done, it needs to remove its id from the internal array
- the function needs to return a Promise, so that we can use `await me.timeout(50);`
- `destroy()` needs to check for timeoutIds first and clear them

@ExtAnimal: did I get your idea right?

## Timeline

- 2023-08-06T16:05:41Z @tobiu added the `enhancement` label
- 2023-08-06T16:34:38Z @tobiu referenced in commit `9b309ea` - "core.Base: timeout() #4660"
### @tobiu - 2023-08-06T16:35:07Z

this is the shortest way i can think of. now we can use it inside our classes.

- 2023-08-06T16:35:07Z @tobiu closed this issue

