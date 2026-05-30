---
id: 1308
title: Add drag&drop tab re-sorting to the neo website app
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-26T10:33:30Z'
updatedAt: '2020-10-26T11:12:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1308'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-26T11:12:20Z'
---
# Add drag&drop tab re-sorting to the neo website app

not really needed here from an UX perspective, but since it is a tech demo, i see no reason not to add it.

## Timeline

- 2020-10-26T10:33:30Z @tobiu added the `enhancement` label
- 2020-10-26T10:33:30Z @tobiu assigned to @tobiu
- 2020-10-26T10:37:13Z @tobiu referenced in commit `129e9c9` - "Add drag&drop tab re-sorting to the neo website app #1308"
- 2020-10-26T10:38:11Z @tobiu referenced in commit `a26956b` - "#1308 added the DD main thread addon for the website dist versions"
- 2020-10-26T10:44:40Z @tobiu referenced in commit `9d24a49` - "#1308 Website.view.MainContainerController: mainTabs config (similar to the covid app)"
- 2020-10-26T10:50:29Z @tobiu referenced in commit `cbcd230` - "#1308 Website.view.MainContainerController: onViewParsed(), onTabMove()"
- 2020-10-26T11:11:08Z @tobiu referenced in commit `d946c9f` - "#1308 Website.view.MainContainerController: onHashChange() => adjusted the logic for dynamic tab position changes"
### @tobiu - 2020-10-26T11:12:20Z

a bit more tricky than i thought: the onHashChange() logic needs to be aware of dynamic tab position changes.

resolved now.

- 2020-10-26T11:12:20Z @tobiu closed this issue

