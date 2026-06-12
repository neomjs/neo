---
id: 543
title: Dynamically override __webpack_public_path__ for the main thread
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-16T13:42:48Z'
updatedAt: '2020-05-16T13:43:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/543'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-16T13:43:12Z'
---
# Dynamically override __webpack_public_path__ for the main thread

the main thread can get imported from different tree levels. e.g.

/docs/index.html

/apps/covid/index.html

depending on the level, webpack is looking on the wrong spot for the addons.

we do not want to create multiple versions of main => one for each folder level

webpack is handling __webpack_public_path__ in a poor way, so we need to enforce an override.

## Timeline

- 2020-05-16T13:42:48Z @tobiu added the `enhancement` label
- 2020-05-16T13:42:48Z @tobiu assigned to @tobiu
- 2020-05-16T13:43:08Z @tobiu referenced in commit `804da69` - "Dynamically override __webpack_public_path__ for the main thread #543"
- 2020-05-16T13:43:12Z @tobiu closed this issue

