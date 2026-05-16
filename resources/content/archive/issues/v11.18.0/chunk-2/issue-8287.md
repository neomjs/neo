---
id: 8287
title: Refactor InteractionService.dispatch to use object destructuring
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-02T11:54:18Z'
updatedAt: '2026-01-02T11:56:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8287'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-02T11:56:34Z'
---
# Refactor InteractionService.dispatch to use object destructuring

**Context:**
The `dispatch` helper method in `InteractionService.mjs` currently takes multiple arguments (`id`, `type`, `options`, `windowId`). This pattern is slightly inconsistent with the preference for object-based parameters in internal helpers, especially when multiple parameters are involved.

**Requirement:**
Refactor `InteractionService.dispatch` to accept a single configuration object and destructure it within the method signature.

**Current Signature:**
```javascript
async dispatch(id, type, options, windowId)
```

**Desired Signature:**
```javascript
async dispatch({id, options, type, windowId})
```

**Implementation:**
1.  Update `dispatch` method in `src/ai/client/InteractionService.mjs`.
2.  Update the call site within `simulateEvent` in the same file.


## Timeline

- 2026-01-02T11:54:19Z @tobiu added the `good first issue` label
- 2026-01-02T11:54:19Z @tobiu added the `ai` label
- 2026-01-02T11:54:19Z @tobiu added the `refactoring` label
- 2026-01-02T11:54:46Z @tobiu assigned to @tobiu
- 2026-01-02T11:54:54Z @tobiu removed the `good first issue` label
- 2026-01-02T11:55:54Z @tobiu referenced in commit `e75a4be` - "Refactor InteractionService.dispatch to use object destructuring #8287"
### @tobiu - 2026-01-02T11:56:02Z

**Input from Gemini 2.5 pro:**

> ✦ I have completed the refactoring of `InteractionService.dispatch` to use object destructuring.
> 
> **Changes:**
> 1.  Modified `dispatch` signature to `async dispatch({id, options, type, windowId})`.
> 2.  Updated `simulateEvent` to call `dispatch` with an object argument.
> 3.  Updated JSDoc to reflect the new signature.
> 
> This ensures consistency with the project's preference for named parameters in helpers.

- 2026-01-02T11:56:34Z @tobiu closed this issue

