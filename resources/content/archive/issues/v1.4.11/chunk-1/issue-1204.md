---
id: 1204
title: dynamic root folders for dynamic imports inside webpack based builds
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-09-16T14:49:14Z'
updatedAt: '2020-09-16T21:18:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1204'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-09-16T21:18:26Z'
---
# dynamic root folders for dynamic imports inside webpack based builds

cross reference ticket for:
https://github.com/webpack/webpack/issues/11483

in case there was a way to specify different folder roots, we could remove the custom app worker build entry point.

we can not use '../../../../../' for everything, since this would slow down the build time by a long shot and create split chunks we don't want.

e.g.: I got the following structure locally:

github
- neomjs
- - neo
- - covid-dashboard
- - realworld

(all sub repos)

walking up too far would create split chunks across the different sub repos.

## Timeline

- 2020-09-16T14:49:14Z @tobiu added the `enhancement` label
- 2020-09-16T20:57:51Z @tobiu referenced in commit `34babc0` - "dynamic root folders for dynamic imports inside webpack based builds #1204"
### @tobiu - 2020-09-16T21:18:26Z

works fine now!

- 2020-09-16T21:18:26Z @tobiu closed this issue

