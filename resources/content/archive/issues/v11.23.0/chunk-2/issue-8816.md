---
id: 8816
title: Fix Prototype Pollution in Unit Tests by Assigning Neo.setupClass
state: CLOSED
labels:
  - bug
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-01-19T17:29:53Z'
updatedAt: '2026-01-19T17:30:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8816'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T17:30:51Z'
---
# Fix Prototype Pollution in Unit Tests by Assigning Neo.setupClass

Multiple unit tests were calling `Neo.setupClass(Class)` without assigning the result back to the class variable.
This causes prototype pollution because the original class constructor is modified in place (or its prototype is), but the enhanced class (returned by `setupClass`) is not used.
This leads to unpredictable test interactions and failures, particularly `TypeError: Neo.setupClass is not a function` when subsequent tests rely on a clean state or when the class system enhancement logic is bypassed.

This fix applies the pattern `Class = Neo.setupClass(Class)` to all affected unit tests.

## Timeline

- 2026-01-19T17:29:55Z @tobiu added the `bug` label
- 2026-01-19T17:29:55Z @tobiu added the `testing` label
- 2026-01-19T17:29:55Z @tobiu added the `core` label
- 2026-01-19T17:30:06Z @tobiu referenced in commit `24a9051` - "fix: Prevent prototype pollution in unit tests by assigning Neo.setupClass result (#8816)"
- 2026-01-19T17:30:21Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-19T17:30:34Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the `Class = Neo.setupClass(Class)` pattern to all unit tests that were missing it. This ensures that the class system works correctly and prevents prototype pollution that was causing instability and cross-test contamination.
> Files updated:
> - `test/playwright/unit/core/ClassConfigsAndFields.spec.mjs`
> - `test/playwright/unit/neo/MixinStaticConfig.spec.mjs`
> - `test/playwright/unit/state/Provider.spec.mjs`
> - `test/playwright/unit/vdom/AutoId.spec.mjs`
> 
> This should resolve the `TypeError: Neo.setupClass is not a function` errors seen in CI.

- 2026-01-19T17:30:51Z @tobiu closed this issue

