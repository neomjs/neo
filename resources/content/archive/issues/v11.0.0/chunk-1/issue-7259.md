---
id: 7259
title: VdomHelper incorrectly moves className into attributes
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-09-26T13:13:37Z'
updatedAt: '2025-09-26T13:40:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7259'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-26T13:40:47Z'
---
# VdomHelper incorrectly moves className into attributes

When running unit tests with `useDomApiRenderer: false`, the `VdomHelper.update()` method incorrectly moves the `className` property of a `vdom` object into the `attributes` object of the resulting `vnode`.

According to the `Neo.vdom.VNode` class definition, `className` should be a top-level property on the `vnode` and should not be part of the `attributes` object.

This was discovered while converting the `VdomHelper` Siesta test to Playwright. The Playwright test `test/playwright/unit/VdomHelper.spec.mjs` currently has assertions that are adjusted to expect this buggy behavior to allow the test suite to pass.

## Acceptance Criteria

- Investigate `VdomHelper.update()` and identify why `className` is being misplaced when `useDomApiRenderer` is `false`.
- Correct the logic to ensure `className` is handled as a top-level `vnode` property.
- Update the assertions in `test/playwright/unit/VdomHelper.spec.mjs` to reflect the correct behavior.

## Timeline

- 2025-09-26T13:13:37Z @tobiu assigned to @tobiu
- 2025-09-26T13:13:39Z @tobiu added the `bug` label
### @tobiu - 2025-09-26T13:40:47Z

We can close this one. It was a Gemini hallucination, using `className` instead of `cls` inside the vdom definitions

- 2025-09-26T13:40:47Z @tobiu closed this issue

