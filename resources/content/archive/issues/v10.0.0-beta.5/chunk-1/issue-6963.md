---
id: 6963
title: Add test case for circular dependencies in batched set() operations
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-06T17:02:51Z'
updatedAt: '2025-07-06T17:03:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6963'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-06T17:03:52Z'
---
# Add test case for circular dependencies in batched set() operations

**Description**

To verify the fixes for the regressions introduced in the v10 `core.Config` system, a new test case has been added: `test/siesta/tests/config/CircularDependencies.mjs`.

This test specifically targets the atomicity of `core.Base#set()` and ensures that all config hooks and field setters have a consistent, updated view of the instance's state during a batched update.

**What the Test Verifies**

The test creates a `TestComponent` with multiple reactive configs, a non-reactive config, a public class field, and a public field with a custom setter (`customProp`).

It then calls `instance.set()` with new values for all of these properties simultaneously and asserts the following:

1.  **`afterSet<Config>()` Hooks:** Each `afterSet` hook correctly sees the **new** values of all other configs and fields that were part of the same `set()` call.
2.  **Custom Field Setters:** The custom setter for `customProp` also correctly sees the **new** values of all reactive configs and public fields from the same batch.
3.  **Partial Updates:** It verifies that when only a single config is updated, the other properties on the instance retain their previous values.

**Benefit**

This test provides a critical safety net to prevent future regressions in the complex config initialization logic. It ensures that the `set()` method behaves as a predictable, atomic operation, which is fundamental to the framework's reactivity model.

## Timeline

- 2025-07-06T17:02:51Z @tobiu assigned to @tobiu
- 2025-07-06T17:02:52Z @tobiu added the `enhancement` label
- 2025-07-06T17:03:47Z @tobiu referenced in commit `c3bcf7c` - "Add test case for circular dependencies in batched set() operations #6963"
- 2025-07-06T17:03:52Z @tobiu closed this issue

