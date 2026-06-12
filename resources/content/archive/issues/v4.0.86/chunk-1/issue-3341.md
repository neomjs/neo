---
id: 3341
title: buildThreads => main => broken for the non workspace based scope
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-08-02T19:10:42Z'
updatedAt: '2022-08-02T19:13:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3341'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-08-02T19:12:35Z'
---
# buildThreads => main => broken for the non workspace based scope

The introduction of `workspace` based main thread addons seems to have one really bad side-effect which i missed.

While the dynamic imports are fine, webpack is not aware of being inside the framework scope or not, so it will try to parse a directory which simply does not exist.

Played around different strategies for a while and the only one I got working was (ab)using `webpack.ContextReplacementPlugin`.

## Timeline

- 2022-08-02T19:10:42Z @tobiu added the `bug` label
- 2022-08-02T19:10:42Z @tobiu assigned to @tobiu
- 2022-08-02T19:11:18Z @tobiu referenced in commit `3e7fb65` - "buildThreads => main => broken for the non workspace based scope #3341"
### @tobiu - 2022-08-02T19:12:35Z

@sokra: In case there is a cleaner way, feel free to add a comment. It might make sense to check for folders first within the webpack implementation and break in case the folder is not found.

- 2022-08-02T19:12:35Z @tobiu closed this issue

