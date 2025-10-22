---
id: 6839
title: 'button.Base: map badgeText & text to vdom.text instead of vdom.html'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-18T19:33:53Z'
updatedAt: '2025-06-18T19:34:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6839'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-18T19:34:16Z'
---
# button.Base: map badgeText & text to vdom.text instead of vdom.html

**Reported by:** @tobiu on 2025-06-18

* One of the main v10 benefits: we can now easily make any content XSS secure.
* This does not only affect updates, but also the initial rendering tree.

