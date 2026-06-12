---
id: 529
title: main.addon.LocalStorage
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-03T17:07:06Z'
updatedAt: '2020-05-18T15:04:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/529'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-18T15:04:20Z'
---
# main.addon.LocalStorage

flag to only include Neo.main.mixins.LocalStorage if needed.

## Timeline

- 2020-05-03T17:07:06Z @tobiu added the `enhancement` label
- 2020-05-03T17:07:07Z @tobiu assigned to @tobiu
- 2020-05-03T17:11:10Z @tobiu referenced in commit `5802cf3` - "DefaultConfig: useLocalStorage #529"
- 2020-05-03T19:07:08Z @tobiu referenced in commit `d3141f4` - "DefaultConfig: useLocalStorage #529 => workaround to support dynamic mixins"
- 2020-05-03T19:14:11Z @tobiu closed this issue
### @tobiu - 2020-05-03T20:51:02Z

need a better approach, since ctors can not and getConfig should not be async.

- 2020-05-03T20:51:02Z @tobiu reopened this issue
- 2020-05-18T14:58:58Z @tobiu changed title from **DefaultConfig: useLocalStorage** to **main.addon.LocalStorage**
### @tobiu - 2020-05-18T14:59:20Z

convert the main thread mixin into an addon and adjust the RW app method calls

- 2020-05-18T14:59:47Z @tobiu referenced in commit `5a9a453` - "main.addon.LocalStorage #529"
- 2020-05-18T15:04:20Z @tobiu closed this issue

