---
id: 9415
title: Support "Turbo Mode" in `Neo.data.TreeStore`
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T14:13:50Z'
updatedAt: '2026-03-09T14:22:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9415'
author: tobiu
commentsCount: 2
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-09T14:22:54Z'
---
# Support "Turbo Mode" in `Neo.data.TreeStore`

### Goal
Ensure `Neo.data.TreeStore` can safely operate with `autoInitRecords: false` ("Turbo Mode") without suffering from identity fragmentation between the main `_items` array and its internal tree maps.

### Context
When a `TreeStore` ingests raw JSON data in Turbo Mode, its `#childrenMap` and `#allRecordsMap` store references to those raw objects. If the Grid accesses a node via `store.get()`, the base `Store` instantiates a `Neo.data.Record`. At that moment, the identity diverges: the main `_items` array holds the `Record`, but the `#childrenMap` still holds the raw JSON object. If the `Record` mutates (e.g., `collapsed` state changes), the `#childrenMap` remains unaware.

### Architecture
- Leverage the newly introduced `hydrateRecord` method from the parent `Store` (see dependency).
- Override `hydrateRecord(item, index)` in `TreeStore.mjs`.
- Call `super.hydrateRecord(item, index)`.
- If the method converted a raw object into a `Record`, find the old raw object in `#allRecordsMap` and `#childrenMap` and replace it with the new `Record` instance.

### Dependencies
- Depends on the Store refactoring sub-task (#9414).

## Timeline

- 2026-03-09T14:13:51Z @tobiu added the `enhancement` label
- 2026-03-09T14:13:52Z @tobiu added the `ai` label
- 2026-03-09T14:13:52Z @tobiu added the `performance` label
- 2026-03-09T14:13:52Z @tobiu added the `core` label
- 2026-03-09T14:14:06Z @tobiu added parent issue #9404
- 2026-03-09T14:21:43Z @tobiu referenced in commit `a7778a2` - "feat: Support Turbo Mode in TreeStore (#9415)

- Overridden  to serve as a Single Source of Truth for hydration.
- Ensures  and  are automatically updated when a raw JSON object is converted to a  in Turbo Mode.
- Prevents identity fragmentation and split-brain scenarios between the flat view and the internal hierarchical maps."
### @tobiu - 2026-03-09T14:22:21Z

**Input from Gemini 3.1 Pro:**

> ✦ Implemented Turbo Mode support for `TreeStore`.
> 
> - Overrides the newly centralized `hydrateRecord` method from the base `Store`.
> - Intercepts lazy instantiation events to "heal" `#allRecordsMap` and `#childrenMap`, ensuring they always maintain the unified `Record` identity instead of diverging with raw object references.
> 
> Changes pushed to `dev`.

- 2026-03-09T14:22:32Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-09T14:22:53Z

Implemented Turbo Mode support for TreeStore. Pushed to dev.

- 2026-03-09T14:22:54Z @tobiu closed this issue

