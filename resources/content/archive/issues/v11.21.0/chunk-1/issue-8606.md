---
id: 8606
title: Comprehensive Testing for Fragments
state: CLOSED
labels:
  - ai
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T15:11:31Z'
updatedAt: '2026-01-13T16:30:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8606'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T16:30:20Z'
---
# Comprehensive Testing for Fragments

Part of Epic #8601.

**Goal:** Verify the functionality and stability of `Neo.container.Fragment` across different scenarios.

**Tasks:**
1.  **Unit Tests (VNode/Helper):**
    *   Verify `getPhysicalIndex` correctly counts nested/sibling fragments.
    *   Verify `createDeltas` generates correct fragment-level deltas (not exploded children).
    *   Verify VNode structure creation.
2.  **E2E Tests (Playwright):**
    *   **Structure:** Verify a Fragment renders as `<!-- start --> ...children... <!-- end -->` with NO wrapper element.
    *   **Layout:** Verify children of a Fragment participate in the parent's Grid/Flex layout as individual cells.
    *   **Lifecycle:**
        *   Dynamically insert a Fragment.
        *   Dynamically remove a Fragment.
        *   Move a Fragment (e.g., reordering in a list).
    *   **Nesting:** Test Fragments inside Fragments.

## Timeline

- 2026-01-13T15:11:32Z @tobiu added the `ai` label
- 2026-01-13T15:11:33Z @tobiu added the `testing` label
- 2026-01-13T15:11:33Z @tobiu added the `core` label
- 2026-01-13T15:11:50Z @tobiu added parent issue #8601
- 2026-01-13T15:17:35Z @tobiu cross-referenced by #8601
- 2026-01-13T15:18:45Z @tobiu assigned to @tobiu
- 2026-01-13T16:28:17Z @tobiu referenced in commit `894319e` - "test: Comprehensive Testing for Fragments (#8606)"
### @tobiu - 2026-01-13T16:28:21Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented and passed comprehensive tests for Fragments.
> - **Unit Tests:** `FragmentHelper.spec.mjs` and `FragmentHelperDomApi.spec.mjs` verify index calculation, attribute skipping, and delta generation for both renderers.
> - **E2E Tests:** `Fragment.spec.mjs` verifies actual DOM structure (anchors, no wrapper) and correct layout participation in a browser environment using Playwright.
> 
> This completes the testing requirements.

- 2026-01-13T16:30:20Z @tobiu closed this issue
- 2026-01-13T16:37:32Z @tobiu cross-referenced by #8607

