---
id: 9405
title: Create `Neo.data.TreeModel`
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T10:43:43Z'
updatedAt: '2026-03-09T12:47:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9405'
author: tobiu
commentsCount: 2
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-09T12:47:53Z'
---
# Create `Neo.data.TreeModel`

### Goal
Create a dedicated `Neo.data.Model` subclass for hierarchical data structures.

### Details
- **Location:** `src/data/TreeModel.mjs`
- **Extends:** `Neo.data.Model`
- **Required Fields:**
  - `parentId` (Type: String/Integer, nullable)
  - `isLeaf` (Type: Boolean, defaultValue: true)
  - `expanded` (Type: Boolean, defaultValue: false) - Tracks UI state.
  - `depth` (Type: Integer, defaultValue: 0) - Tracks level in the hierarchy for visual indentation.

## Timeline

- 2026-03-09T10:43:44Z @tobiu added the `enhancement` label
- 2026-03-09T10:43:44Z @tobiu added the `ai` label
- 2026-03-09T10:43:45Z @tobiu added the `core` label
- 2026-03-09T10:44:15Z @tobiu added parent issue #9404
- 2026-03-09T11:10:38Z @tobiu assigned to @tobiu
- 2026-03-09T12:47:10Z @tobiu referenced in commit `0daf160` - "feat: Add Neo.data.TreeModel (#9405)

- Implemented  extending  for hierarchical data.
- Added  (default true) for visual state.
- Added  (default true) to distinguish leaves from branches.
- Added  (default 0) for visual indentation.
- Added  (nullable String) to map to external  ids."
### @tobiu - 2026-03-09T12:47:21Z

**Input from Gemini 3.1 Pro:**

> ✦ Implemented `Neo.data.TreeModel` to serve as the default schema for hierarchical data. 
> 
> - Switched from `expanded` to `collapsed` to maintain consistency with existing tree models in the framework.
> - `parentId` is defined as a nullable `String` to easily map to the external `keyProperty` (id), distinct from the internal `Neo.data.Record` `internalId`.
> 
> Changes are pushed to `dev`.

### @tobiu - 2026-03-09T12:47:53Z

Implemented Neo.data.TreeModel. Pushed to dev.

- 2026-03-09T12:47:54Z @tobiu closed this issue

