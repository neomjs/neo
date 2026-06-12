---
id: 8075
title: Optimize Markdown Component Rendering
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-09T22:54:51Z'
updatedAt: '2025-12-09T23:28:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8075'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-09T23:28:03Z'
---
# Optimize Markdown Component Rendering

Replace the brittle `setTimeout` logic in `src/component/Markdown.mjs` with a VDOM-synchronized approach.
Current implementation uses an arbitrary timeout (100ms/150ms) to wait for VDOM updates after inserting lab divs.

Proposed solution:
Use `await me.set({html: me.insertLabDivs(html)})` which returns `me.promiseUpdate()`, ensuring the VDOM update cycle is complete.
Add a small buffer `await me.timeout(10)` to ensure rendering in the next frame.


## Timeline

- 2025-12-09T22:54:52Z @tobiu added the `enhancement` label
- 2025-12-09T22:54:52Z @tobiu added the `ai` label
- 2025-12-09T22:59:47Z @tobiu assigned to @tobiu
- 2025-12-09T23:00:09Z @tobiu referenced in commit `7d1de7a` - "Optimize Markdown Component Rendering #8075"
- 2025-12-09T23:28:03Z @tobiu closed this issue

