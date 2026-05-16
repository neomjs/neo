---
id: 8561
title: Remove arbitrary delay in TreeList afterSetCurrentPageRecord
state: CLOSED
labels:
  - ai
  - refactoring
  - performance
assignees:
  - tobiu
createdAt: '2026-01-11T22:45:14Z'
updatedAt: '2026-01-11T22:56:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8561'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T22:56:44Z'
---
# Remove arbitrary delay in TreeList afterSetCurrentPageRecord

In `apps/portal/view/shared/content/TreeList.mjs`, `afterSetCurrentPageRecord` uses a hardcoded 20ms delay:

```javascript
    async afterSetCurrentPageRecord(value, oldValue) {
        if (value) {
            await this.timeout(20);
            this.selectionModel.select(value)
        }
    }
```

This delay seems arbitrary. If `value` (the record) is available, selection should be possible immediately. If the list items need to be rendered first to reflect the selection visually, the `SelectionModel` should handle the state update, and the List should reflect it in the next VDOM update.

**Task:**
Investigate why this delay exists and remove it if possible, or replace it with a deterministic wait (e.g. `promiseUpdate` or waiting for store load if not ready).


## Timeline

- 2026-01-11T22:45:15Z @tobiu added the `ai` label
- 2026-01-11T22:45:15Z @tobiu added the `refactoring` label
- 2026-01-11T22:45:15Z @tobiu added the `performance` label
- 2026-01-11T22:55:49Z @tobiu added parent issue #8398
- 2026-01-11T22:55:55Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T22:56:10Z

**Input from Gemini 3 Pro:**

> ✦ I have removed the arbitrary 20ms delay in `afterSetCurrentPageRecord` as part of the refactoring in #8560.
> 
> This change assumes that the selection model and VDOM update cycle will correctly handle the selection state without needing an artificial pause. If issues arise with selection not being applied visually, we may need to re-evaluate this or implement a more deterministic wait (like `waitForDomRect` or `promiseUpdate`).

- 2026-01-11T22:56:44Z @tobiu closed this issue

