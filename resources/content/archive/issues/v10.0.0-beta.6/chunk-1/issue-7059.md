---
id: 7059
title: Add support for "empty" vdom child nodes
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-15T17:10:30Z'
updatedAt: '2025-07-15T17:11:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7059'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-15T17:11:31Z'
---
# Add support for "empty" vdom child nodes

While this coding style works, I doubt that many devs will think about not polluting vdom with empty values.
```
            }, isComposing ? {
                module : ComposeView,
                id     : 'compose-view',
                onClose: onCloseCompose
            } : null].filter(Boolean)
```

So, we should enable the following syntax:
```
            }, isComposing && {
                module : ComposeView,
                id     : 'compose-view',
                onClose: onCloseCompose
            }]
```

`null` or `false` values.

`vdom.Helper` needs a boolean filter to prevent these items to get into vnode trees.

`manager.Component#getVdomTree()` must no longer transform these values into empty objects.

## Timeline

- 2025-07-15T17:10:30Z @tobiu assigned to @tobiu
- 2025-07-15T17:10:31Z @tobiu added the `enhancement` label
- 2025-07-15T17:11:17Z @tobiu referenced in commit `b0dbcf0` - "Add support for "empty" vdom child nodes #7059"
- 2025-07-15T17:11:31Z @tobiu closed this issue

