---
id: 959
title: 'Neo.clone(): add support for dates'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-07-21T15:55:46Z'
updatedAt: '2020-07-21T15:56:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/959'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-07-21T15:56:10Z'
---
# Neo.clone(): add support for dates

just noticed that dates can get lost inside the cloning process:

```
        /**
         * The currently active date inside all views
         * @member {Date} currentDate_=new Date()
         */
        currentDate_: new Date(),
```

Will adjust Neo.clone()

## Timeline

- 2020-07-21T15:55:46Z @tobiu added the `enhancement` label
- 2020-07-21T15:55:46Z @tobiu assigned to @tobiu
- 2020-07-21T15:56:08Z @tobiu referenced in commit `2f80aab` - "Neo.clone(): add support for dates #959"
- 2020-07-21T15:56:10Z @tobiu closed this issue

