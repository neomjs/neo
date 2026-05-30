---
id: 73
title: 'RealWorld app: HomeComponent => paging buttons'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2019-11-19T19:57:17Z'
updatedAt: '2019-11-20T17:06:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/73'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2019-11-20T17:06:23Z'
---
# RealWorld app: HomeComponent => paging buttons

similar to this one:
https://vue-vuex-realworld.netlify.com/

1) buttons with the new page number
2) showing the current page as the active button
3) clicking on a button => api call with a different start value

## Timeline

- 2019-11-19T19:57:17Z @tobiu added the `enhancement` label
- 2019-11-19T21:58:34Z @tobiu referenced in commit `e2a6075` - "RealWorld app: HomeComponent => paging buttons #73 (countPages, nav bbar markup, rendering a first item (in progress))"
- 2019-11-19T22:08:54Z @tobiu referenced in commit `b61936e` - "RealWorld app: HomeComponent => paging buttons #73 (rendering all pages buttons (in progress))"
- 2019-11-20T16:22:39Z @tobiu referenced in commit `fbf563f` - "RealWorld app: HomeComponent => paging buttons #73 => delegated nav link click listeners, currentPage_, afterSetCurrentPage()"
- 2019-11-20T16:37:00Z @tobiu referenced in commit `c8dde5f` - "RealWorld app: HomeComponent => paging buttons #73 => afterSetCurrentPage() logic to toggle the active css class"
- 2019-11-20T17:05:39Z @tobiu referenced in commit `816fc07` - "RealWorld app: HomeComponent => paging buttons #73 => (bulk)updating the previewComponents on page switch"
### @tobiu - 2019-11-20T17:06:23Z

implemented.

- 2019-11-20T17:06:23Z @tobiu closed this issue
- 2019-11-20T17:10:48Z @tobiu referenced in commit `ac80ef0` - "RealWorld app: HomeComponent => paging buttons #73 => afterSetCurrentPage() => using this.pageSize instead of a static value"

