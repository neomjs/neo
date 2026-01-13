---
id: 8607
title: Advanced Fragment Lifecycle Testing (Moves & Nesting)
state: OPEN
labels:
  - ai
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T16:37:31Z'
updatedAt: '2026-01-13T16:40:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8607'
author: tobiu
commentsCount: 0
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Advanced Fragment Lifecycle Testing (Moves & Nesting)

Extending the coverage of #8606.
Verify complex lifecycle scenarios for `Neo.container.Fragment`:
1.  **Move In:** Move a component from a Container into a child Fragment.
2.  **Move Out:** Move a component from a Fragment into its parent Container.
3.  **Cross-Fragment Move:** Move a component from Fragment A to Fragment B (siblings).
4.  **Nested Moves:** Move a component deeper into a nested Fragment hierarchy.
5.  **Renderer Parity:** Ensure these work identically in `DomApiRenderer` and `StringBasedRenderer` (via Unit tests) and visually in Browser (via Component tests).

This will be a sub-issue of Epic #8601.

## Timeline

- 2026-01-13T16:37:32Z @tobiu added the `ai` label
- 2026-01-13T16:37:32Z @tobiu added the `testing` label
- 2026-01-13T16:37:32Z @tobiu added the `core` label
- 2026-01-13T16:37:48Z @tobiu added parent issue #8601
- 2026-01-13T16:40:56Z @tobiu assigned to @tobiu

