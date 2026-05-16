---
id: 8108
title: Refactor Legit App to use a dedicated Service
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-13T15:31:40Z'
updatedAt: '2025-12-13T16:00:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8108'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-13T16:00:00Z'
---
# Refactor Legit App to use a dedicated Service

To improve architecture and error handling, we will introduce `Legit.service.Legit` as a singleton.

**New File:** `apps/legit/service/Legit.mjs`

**Responsibilities:**
- Load external dependencies (`@legit-sdk/core`, `memfs`).
- Initialize the file system.
- Handle git-like operations (`loadTree`, `loadTreeDelta`).
- Provide file I/O methods.

**Updates:**
- `apps/legit/view/ViewportController.mjs`: Delegate logic to the new service.


## Timeline

- 2025-12-13T15:31:41Z @tobiu added the `enhancement` label
- 2025-12-13T15:31:41Z @tobiu added the `ai` label
- 2025-12-13T15:31:41Z @tobiu added the `refactoring` label
- 2025-12-13T15:32:13Z @tobiu assigned to @tobiu
- 2025-12-13T15:59:52Z @tobiu referenced in commit `436df64` - "Refactor Legit App to use a dedicated Service #8108"
- 2025-12-13T16:00:00Z @tobiu closed this issue

