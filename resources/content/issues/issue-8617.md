---
id: 8617
title: Refactor StringBasedRenderer for API Parity (Separate Creation from Insertion)
state: OPEN
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T19:53:08Z'
updatedAt: '2026-01-13T19:59:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8617'
author: tobiu
commentsCount: 0
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor StringBasedRenderer for API Parity (Separate Creation from Insertion)

During Fragment implementation, it was noted that `StringBasedRenderer.insertNodeAsString` handles *both* creation (from string) and insertion (into parent), whereas `DomApiRenderer.createDomTree` returns the node for the caller to insert.
This inconsistency forced `DeltaUpdates` to bypass `insertNodeAsString` and use `htmlStringToElement` directly for Fragments.

**Goal:**
Refactor `StringBasedRenderer` to expose a `createNode` (or similar) method that returns a `DocumentFragment`/`Element` from the delta, and update `DeltaUpdates` to handle the insertion step uniformly for both renderers. This improves code reuse and maintainability.

## Timeline

- 2026-01-13T19:53:09Z @tobiu added the `ai` label
- 2026-01-13T19:53:09Z @tobiu added the `refactoring` label
- 2026-01-13T19:53:09Z @tobiu added the `core` label
- 2026-01-13T19:54:51Z @tobiu added parent issue #8601
- 2026-01-13T19:59:17Z @tobiu assigned to @tobiu

