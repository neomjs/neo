---
id: 6632
title: 'grid.column.Component: support view controller based handlers / listeners and state provider bindings'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-04-08T18:30:09Z'
updatedAt: '2025-04-08T18:32:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6632'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-08T18:32:27Z'
---
# grid.column.Component: support view controller based handlers / listeners and state provider bindings

```
            columns: [
                {dataField: 'edit', text: 'Edit Action', component: {
                    module : Button,
                    handler: 'up.editButtonHandler', // handler inside the parent component tree
                    text   : 'Edit'
                }},
                {dataField: 'edit2', text: 'Edit Action2', component: {
                    module : Button,
                    handler: 'editButtonHandler2', // handler inside a view controller
                    bind   : {text: data => data.editButtonText} // state provider binding
                }}
            ],
```

## Timeline

- 2025-04-08T18:30:09Z @tobiu added the `enhancement` label
- 2025-04-08T18:30:09Z @tobiu assigned to @tobiu
- 2025-04-08T18:32:24Z @tobiu referenced in commit `e98b61a` - "grid.column.Component: support view controller based handlers / listeners and state provider bindings #6632"
- 2025-04-08T18:32:27Z @tobiu closed this issue

