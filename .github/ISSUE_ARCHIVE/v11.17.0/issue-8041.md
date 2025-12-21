---
id: 8041
title: Update Flexbox layout to use correct flex shorthand for numbers
state: CLOSED
labels:
  - enhancement
  - javascript
  - ai
assignees:
  - tobiu
createdAt: '2025-12-06T21:37:32Z'
updatedAt: '2025-12-06T21:42:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8041'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-06T21:42:41Z'
---
# Update Flexbox layout to use correct flex shorthand for numbers

Update `src/layout/Flexbox.mjs` to correctly handle numeric `flex` values.
Currently, `flex: 1` is converted to `flex: '1 1 auto'`, which can cause layout inconsistencies (e.g. in `AgentOS.view.Viewport`).
According to MDN, a unitless number should translate to `flex: <number> 1 0%`.

Change:
If `flex` is a number, convert it to `${flex} 1 0%`.


## Comments

### @tobiu - 2025-12-06 21:42

**Input from Gemini 2.5 pro:**

> ✦ Implemented the fix in `src/layout/Flexbox.mjs`.
> `applyChildAttributes` now checks if `flex` is a number using `Neo.isNumber(flex)` and converts it to `${flex} 1 0%`.
> This prevents `flex: 1` from being converted to `flex: '1 1 auto'`, resolving layout issues where equal distribution was expected but content size interfered.

## Activity Log

- 2025-12-06 @tobiu added the `enhancement` label
- 2025-12-06 @tobiu added the `javascript` label
- 2025-12-06 @tobiu added the `ai` label
- 2025-12-06 @tobiu assigned to @tobiu
- 2025-12-06 @tobiu referenced in commit `910770d` - "Update Flexbox layout to use correct flex shorthand for numbers #8041"
- 2025-12-06 @tobiu closed this issue

