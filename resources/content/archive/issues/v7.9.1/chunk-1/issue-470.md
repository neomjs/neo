---
id: 470
title: 'Covid.view.MainContainerController: country selection & OSM'
state: CLOSED
labels:
  - bug
  - stale
assignees:
  - tobiu
createdAt: '2020-04-13T16:12:11Z'
updatedAt: '2024-09-28T02:31:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/470'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-28T02:31:52Z'
---
# Covid.view.MainContainerController: country selection & OSM

the very first country selection / change does move the map without a visual animation, all frequent changes work fine.

my guess would be onHashChange() where the countryRecord is not set yet.

## Timeline

- 2020-04-13T16:12:11Z @tobiu added the `bug` label
- 2020-04-13T16:12:11Z @tobiu assigned to @tobiu
### @github-actions - 2024-09-14T02:27:40Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:27:40Z @github-actions added the `stale` label
### @github-actions - 2024-09-28T02:31:52Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-28T02:31:52Z @github-actions closed this issue

