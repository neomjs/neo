---
id: 8617
title: Refactor StringBasedRenderer for API Parity (Separate Creation from Insertion)
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T19:53:08Z'
updatedAt: '2026-01-13T23:11:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8617'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T23:10:28Z'
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
- 2026-01-13T23:10:28Z @tobiu closed this issue
- 2026-01-13T23:10:31Z @tobiu referenced in commit `7713cbb` - "refactor(StringBasedRenderer): Consolidate logic into createNode and remove unused methods (#8617)"
- 2026-01-13T23:10:31Z @tobiu referenced in commit `9e0e788` - "fix(DeltaUpdates): Unified insertion logic & scroll state fix for DomApiRenderer (#8617)"
### @tobiu - 2026-01-13T23:11:11Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `StringBasedRenderer` to expose `createNode({outerHTML})`, aligning it with the `DomApiRenderer` creation pattern. 
> 
> **Critical Fixes & verification:**
> 1.  **Unified Insertion:** `DeltaUpdates.insertNode` now uses a consistent creation-then-insertion flow for both renderers.
> 2.  **Scroll State Preservation:** Fixed a bug where `DomApiRenderer` lost scroll state during insertion. Implemented a unified `postMountUpdates` handler that supports both node-reference (DomApi) and ID-lookup (StringBased) formats.
> 3.  **Refactoring:** Removed unused `insertNodeAsString` and `htmlStringToElement`, consolidating logic into `createNode`.
> 4.  **Testing:** Added regression tests in `FragmentDeltaUpdates.spec.mjs` verifying `scrollTop` preservation for both `DomApiRenderer` and `StringBasedRenderer`.


