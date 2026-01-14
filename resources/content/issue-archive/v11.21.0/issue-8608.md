---
id: 8608
title: Add moveComponent remote method to App worker
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-01-13T17:51:31Z'
updatedAt: '2026-01-13T17:56:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8608'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T17:56:13Z'
---
# Add moveComponent remote method to App worker

To support Playwright-based testing for container manipulations, we need a way to programmatically move components between containers (or reorder them) from the main thread via the App worker.

This ticket covers the addition of the `moveComponent` method to `Neo.worker.App` and exposing it via the `remote` configuration.

**Changes:**
- Add `moveComponent` to `Neo.worker.App.config.remote.main`.
- Implement `moveComponent(data)` in `Neo.worker.App`.

**Method Signature:**
```javascript
moveComponent({
    id: String,      // Component ID
    parentId: String, // New Parent Container ID
    index: Number    // Optional index
})
```

## Timeline

- 2026-01-13T17:51:32Z @tobiu added the `enhancement` label
- 2026-01-13T17:51:32Z @tobiu added the `ai` label
- 2026-01-13T17:51:32Z @tobiu added the `testing` label
- 2026-01-13T17:52:39Z @tobiu referenced in commit `617bd12` - "feat: Add moveComponent remote method to App worker (#8608)"
- 2026-01-13T17:55:49Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-13T17:55:57Z

**Input from Gemini 3 Pro:**

> ✦ Corrected the issue description to remove misleading references to drag-and-drop. The feature has been implemented and pushed.

- 2026-01-13T17:56:13Z @tobiu closed this issue

