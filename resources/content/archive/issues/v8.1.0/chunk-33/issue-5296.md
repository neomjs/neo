---
id: 5296
title: 'Portal.view.learn.PageSectionsPanel: styling'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - mxmrtns
createdAt: '2024-03-04T22:10:31Z'
updatedAt: '2024-09-12T02:28:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5296'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:28:08Z'
---
# Portal.view.learn.PageSectionsPanel: styling

hi max,

for now the list is just using the same CSS as the TreeList:
```
        items: [{
            module: List,
            bind  : {store: 'stores.contentSections'},
            cls   : ['topics-tree']
        }]
```

you are welcome to change this anyway you like to :)

<img width="1514" alt="Screenshot 2024-03-04 at 22 36 34" src="https://github.com/neomjs/neo/assets/1177434/37e2c37f-dad9-4995-a59c-049c948d8278">

## Timeline

- 2024-03-04T22:10:31Z @tobiu added the `enhancement` label
- 2024-03-04T22:10:32Z @tobiu assigned to @mxmrtns
### @github-actions - 2024-08-29T02:25:32Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:25:32Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:28:08Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:28:08Z @github-actions closed this issue

