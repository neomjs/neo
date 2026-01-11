---
id: 8089
title: Add tests for Custom VDOM Root DOM Events
state: CLOSED
labels:
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2025-12-11T14:23:10Z'
updatedAt: '2025-12-11T14:34:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8089'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-11T14:34:22Z'
---
# Add tests for Custom VDOM Root DOM Events

## Description
We need to add a new Playwright test suite to verify DOM event mapping for components with custom VDOM roots (wrapped components).

This ensures that:
1. Events bubbling from the logical root (e.g. `<button>`) are correctly mapped to the component.
2. Events originating from the physical wrapper node (e.g. `<div>` or `<th>`) are also correctly mapped to the component.
3. Event delegation works correctly within these structures.

This test suite `test/playwright/unit/manager/domEvent/CustomVdomRoot.spec.mjs` was created during the fix for #8088 and should be permanently added to the repository to prevent regressions.

## Tasks
- [x] Create `test/playwright/unit/manager/domEvent/CustomVdomRoot.spec.mjs`
- [x] Verify tests pass


## Timeline

- 2025-12-11T14:23:11Z @tobiu added the `ai` label
- 2025-12-11T14:23:11Z @tobiu added the `testing` label
- 2025-12-11T14:33:36Z @tobiu assigned to @tobiu
- 2025-12-11T14:34:08Z @tobiu referenced in commit `e4e2603` - "Add tests for Custom VDOM Root DOM Events #8089"
- 2025-12-11T14:34:23Z @tobiu closed this issue

