---
id: 6814
title: 'component.Base: vdom => remove support for vdom.nodeName'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-16T12:23:45Z'
updatedAt: '2025-06-16T12:29:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6814'
author: tobiu
commentsCount: 0
parentIssue: 6785
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-16T12:29:58Z'
---
# component.Base: vdom => remove support for vdom.nodeName

* It was never used inside the framework code
* We need a single source of truth to prevent lots of additional checks.

## Timeline

- 2025-06-16T12:23:46Z @tobiu added the `enhancement` label
- 2025-06-16T12:23:46Z @tobiu added parent issue #6785
- 2025-06-16T12:28:59Z @tobiu assigned to @tobiu
- 2025-06-16T12:29:51Z @tobiu referenced in commit `0b27318` - "component.Base: vdom => remove support for vdom.nodeName #6814"
- 2025-06-16T12:29:58Z @tobiu closed this issue

