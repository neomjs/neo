---
id: 1301
title: 'tab.header.Toolbar: afterSetSortable() => ensure to not create multiple sortZones'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-24T14:38:54Z'
updatedAt: '2020-10-24T14:48:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1301'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-24T14:48:00Z'
---
# tab.header.Toolbar: afterSetSortable() => ensure to not create multiple sortZones

same for container.Toolbar.

if we set sortable to true, then to false and back to true, there has to be a check in place to not re-create the sortZone.

i think it makes sense to keep it when dynamically(!) setting it to false, since there is a good chance to re-activate it later on.

## Timeline

- 2020-10-24T14:38:54Z @tobiu added the `enhancement` label
- 2020-10-24T14:38:55Z @tobiu assigned to @tobiu
- 2020-10-24T14:40:29Z @tobiu referenced in commit `11c1ba6` - "tab.header.Toolbar: afterSetSortable() => ensure to not create multiple sortZones #1301"
- 2020-10-24T14:41:28Z @tobiu referenced in commit `75491a4` - "#1301 adjusted container.Toolbar"
- 2020-10-24T14:42:39Z @tobiu referenced in commit `b8cba18` - "#1301 adjusted list.Base"
- 2020-10-24T14:48:00Z @tobiu closed this issue

