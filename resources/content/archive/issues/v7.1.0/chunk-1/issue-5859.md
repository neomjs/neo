---
id: 5859
title: 'manager.DomEvents: add support for string based listeners, which map into the component tree'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-10T11:54:25Z'
updatedAt: '2024-09-10T11:54:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5859'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-10T11:54:58Z'
---
# manager.DomEvents: add support for string based listeners, which map into the component tree

to keep consistency for custom events.

use case:
```
        items: [{
            vdom: {tag: 'button', innerHTML: 'Click me!'},

            domListeners: [{
                click: 'up.onButtonClick'
            }]
        }]
```

## Timeline

- 2024-09-10T11:54:25Z @tobiu added the `enhancement` label
- 2024-09-10T11:54:25Z @tobiu assigned to @tobiu
- 2024-09-10T11:54:55Z @tobiu referenced in commit `f1da4ed` - "manager.DomEvents: add support for string based listeners, which map into the component tree #5859"
- 2024-09-10T11:54:58Z @tobiu closed this issue

