---
id: 5402
title: 'coding_guidelines:  correct term from "alphabetical" to  "chronological" order'
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2024-05-10T02:14:10Z'
updatedAt: '2024-09-11T02:26:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5402'
author: gplanansky
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-11T02:26:59Z'
---
# coding_guidelines:  correct term from "alphabetical" to  "chronological" order

https://github.com/neomjs/neo/blob/2001220a26c5c763102aa5fdc27bc6bf9af13463/.github/CODING_GUIDELINES.md

Should not "chronological"  be "alphabetical"? 

```
(19) Class content order:

    static configs (ordered chronologically)
    static config as the last item. This one does not need a comment, but is prefixed with an empty line.
    non-static class fields (ordered chronologically)
    construct() in case you are using it
    all other class methods are ordered chronologically and are prefixed with an empty line.
```


## Timeline

- 2024-05-10T02:14:10Z @gplanansky added the `bug` label
### @github-actions - 2024-08-28T02:24:09Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-28T02:24:10Z @github-actions added the `stale` label
### @github-actions - 2024-09-11T02:26:58Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-11T02:26:59Z @github-actions closed this issue

