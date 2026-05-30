---
id: 1527
title: 'SharedDialog.view.MainContainerController: switchThemeForApp() => use the doc.body'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-10T12:00:12Z'
updatedAt: '2021-03-10T12:00:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1527'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-10T12:00:55Z'
---
# SharedDialog.view.MainContainerController: switchThemeForApp() => use the doc.body

rather than applying the new theme to the main div node of each app, we should add it to the document body instead.

the reason is that the divs needed for dialog show & hide animations get directly added to the document.body.
so, changing the theme on a div on the same DOM tree level won't affect them.

## Timeline

- 2021-03-10T12:00:12Z @tobiu added the `enhancement` label
- 2021-03-10T12:00:12Z @tobiu assigned to @tobiu
- 2021-03-10T12:00:34Z @tobiu referenced in commit `4731168` - "SharedDialog.view.MainContainerController: switchThemeForApp() => use the doc.body #1527"
- 2021-03-10T12:00:55Z @tobiu closed this issue

