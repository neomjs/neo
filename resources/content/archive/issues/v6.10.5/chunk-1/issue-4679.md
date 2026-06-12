---
id: 4679
title: buildScripts/createComponent
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-08-09T07:07:26Z'
updatedAt: '2023-12-05T12:13:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4679'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-12-05T12:13:36Z'
---
# buildScripts/createComponent

while we do already have a program to create a generic class file in place => `buildScripts/createClass.mjs`, it would be nice to have a more specialised version just for components as well.

the new program should:
- create the JS class file (same way as createClass, we can exclude the singleton option)
- generate the theme files (`src`, `theme-dark`, `theme-light`)
- create a `baseCls` inside the JS file, which then gets used inside the scss src file
- create an example folder based on the namespace (class name)
- the example `MainContainer` should already import & display the new component
- the scss src file should already have a `background-color` & `color`, based on theme variables
- we need a themes build to initially render the new component correctly.
- as the last step, it could run `npm run server-start` and immediately show the new component inside a browser window

## Timeline

- 2023-08-09T07:07:26Z @tobiu added the `enhancement` label
### @tobiu - 2023-12-05T12:13:36Z

resolved by @ThorstenRaab 

- 2023-12-05T12:13:36Z @tobiu closed this issue

