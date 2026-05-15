---
id: 8560
title: Replace hardcoded timeout in MainContainerController with deterministic wait
state: CLOSED
labels:
  - ai
  - refactoring
  - performance
assignees:
  - tobiu
createdAt: '2026-01-11T22:45:04Z'
updatedAt: '2026-01-11T22:55:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8560'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T22:55:40Z'
---
# Replace hardcoded timeout in MainContainerController with deterministic wait

In `apps/portal/view/news/tickets/MainContainerController.mjs`, `onRouteItem` uses a hardcoded delay:

```javascript
            if (!oldValue?.hashString?.startsWith('/news/tickets')) {
                await me.timeout(100);
                tree.scrollToItem(itemId)
            }
```

This delay is intended to wait for the tree to expand and render before scrolling. However, 100ms is arbitrary and can be flaky or wasteful.

**Proposed Solution:**
Replace `await me.timeout(100)` with a deterministic wait, likely `await tree.promiseUpdate()`, which ensures that the VDOM updates (triggered by `tree.expandParents(itemId)`) have been processed and applied to the DOM.

We need to verify if `promiseUpdate()` is sufficient for `scrollToItem` to work (which relies on `document.getElementById`).


## Timeline

- 2026-01-11T22:45:05Z @tobiu added the `ai` label
- 2026-01-11T22:45:05Z @tobiu added the `refactoring` label
- 2026-01-11T22:45:05Z @tobiu added the `performance` label
- 2026-01-11T22:54:04Z @tobiu referenced in commit `5eb836d` - "refactor: Replace timeouts with robust DOM waits in TreeList logic (#8560)"
- 2026-01-11T22:54:24Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T22:54:35Z

**Input from Gemini 3 Pro:**

> ✦ I have replaced the hardcoded `timeout(100)` in `MainContainerController.mjs` with a robust `waitForDomRect` check.
> 
> **Changes:**
> - Replaced `await me.timeout(100)` with `await tree.waitForDomRect({id, attempts: 20, delay: 20})`.
> - This ensures the code waits for the tree item to be truly rendered, visible, and laid out (expanded) before attempting to scroll to it.
> - This addresses the flakiness of fixed timeouts while ensuring scrolling only happens when the target is ready.
> 
> I also removed the arbitrary 20ms delay in `TreeList.afterSetCurrentPageRecord` as discussed, assuming the reactive update cycle should handle selection state correctly.

- 2026-01-11T22:54:43Z @tobiu added parent issue #8398
- 2026-01-11T22:55:40Z @tobiu closed this issue
- 2026-01-11T22:56:11Z @tobiu cross-referenced by #8561

