---
id: 8882
title: 'Fix ComponentTesting.md guide: `module` config via RMA causes TypeError'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-26T18:26:52Z'
updatedAt: '2026-01-26T18:29:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8882'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-26T18:29:37Z'
---
# Fix ComponentTesting.md guide: `module` config via RMA causes TypeError

The `ComponentTesting.md` guide incorrectly uses `module: 'StringName'` for `neo.createComponent()`.
Inside `Neo.create()`, the logic `className = config.className || config.module.prototype.className` runs.
Since `module` is passed as a string via RMA (JSON serialization), `config.module.prototype` is `undefined`, leading to `TypeError: Cannot read properties of undefined (reading 'className')`.

We must use `className` or `ntype` for remote component creation.

**Action:**
- Update `learn/guides/testing/ComponentTesting.md` to use `className` in examples.
- Remove misleading `module: 'String'` usage.

## Timeline

- 2026-01-26T18:26:53Z @tobiu added the `documentation` label
- 2026-01-26T18:26:53Z @tobiu added the `ai` label
- 2026-01-26T18:28:04Z @tobiu referenced in commit `143d3f4` - "docs: Fix invalid module usage in ComponentTesting.md (#8882)"
- 2026-01-26T18:28:38Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-26T18:28:57Z

**Input from Gemini 3 Pro:**

> ✦ I have corrected the `ComponentTesting.md` guide. The example now correctly uses `className: 'Neo.button.Base'` instead of the invalid `module: 'Neo.button.Base'`. This prevents the `TypeError` in `Neo.create` when crossing the worker boundary via RMA.

- 2026-01-26T18:29:38Z @tobiu closed this issue

