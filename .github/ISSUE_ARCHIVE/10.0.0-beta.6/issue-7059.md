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
closedAt: '2025-07-15T17:11:31Z'
---
# Add support for "empty" vdom child nodes

**Reported by:** @tobiu on 2025-07-15

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

