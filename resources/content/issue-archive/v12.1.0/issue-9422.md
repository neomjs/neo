---
id: 9422
title: Update TreeStore to manage ARIA sibling fields on mutations
state: CLOSED
labels:
  - enhancement
  - architecture
  - core
  - grid
assignees:
  - tobiu
createdAt: '2026-03-09T18:16:53Z'
updatedAt: '2026-03-09T18:40:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9422'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-09T18:40:25Z'
---
# Update TreeStore to manage ARIA sibling fields on mutations

### Goal
To ensure O(1) performance in the  rendering hot path, the  and  properties are maintained directly on the  records. The  must be updated to automatically manage these fields when the tree structure mutates.

### Context
This is a follow-up to Epic #9404 and sub-task #9408. We made a deliberate architectural trade-off to prioritize fast reads during 60-120fps scrolling over fast writes during data mutations.

### Tasks
- [ ] Update  to intercept , , and  operations.
- [ ] Implement logic to find the parent node of the mutated items.
- [ ] Iterate over the  array for that parent to recalculate and update  and  (1-based) for all siblings.
- [ ] Ensure these updates fire appropriate  events so the UI can update if those siblings are currently visible.


## Timeline

- 2026-03-09T18:16:53Z @tobiu assigned to @tobiu
- 2026-03-09T18:16:55Z @tobiu added the `enhancement` label
- 2026-03-09T18:16:55Z @tobiu added the `architecture` label
- 2026-03-09T18:16:55Z @tobiu added the `core` label
- 2026-03-09T18:16:55Z @tobiu added the `grid` label
- 2026-03-09T18:19:04Z @tobiu added parent issue #9404
- 2026-03-09T18:19:25Z @tobiu changed title from **Manage ARIA sibling fields on TreeStore mutations** to **Update TreeStore to manage ARIA sibling fields on mutations**
- 2026-03-09T18:39:52Z @tobiu referenced in commit `b3c85f6` - "feat(data): Manage ARIA sibling fields on TreeStore ingest (#9422)"
### @tobiu - 2026-03-09T18:40:00Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the `updateSiblingStats` logic during the ingestion phase (`add()`), ensuring that `siblingCount` and `siblingIndex` are properly initialized for all nodes (visible and hidden) as they enter the `TreeStore`. 
> 
> However, as discussed during the architectural review, full CRUD support (removing nodes, moving nodes via drag & drop) requires a dedicated effort to override `splice()` or `remove()` to ensure `#childrenMap` and `#allRecordsMap` remain synchronized. This is outside the scope of simple ARIA ingestion.
> 
> I am closing this issue as the ingestion portion is complete, and we will create a dedicated Epic sub-task for "TreeStore Full CRUD Support".

- 2026-03-09T18:40:25Z @tobiu closed this issue

