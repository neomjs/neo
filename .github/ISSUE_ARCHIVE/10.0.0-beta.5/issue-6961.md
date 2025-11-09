---
id: 6961
title: 'Refactor(core.Base): Harden config initialization order after v10 changes'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-06T16:38:17Z'
updatedAt: '2025-07-06T16:58:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6961'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-06T16:58:40Z'
---
# Refactor(core.Base): Harden config initialization order after v10 changes

**Reported by:** @tobiu on 2025-07-06

**Description**

The introduction of the `core.Config` system in v10 revealed a subtle timing issue in `core.Base#set()`. The implicit order of operations could cause a public field's setter (`set myField()`) to execute *before* the new values of reactive configs (`myConfig_`) from the same update batch were fully processed and available.

This refactoring hardens the initialization logic within `core.Base` to make it more explicit and robust in the context of the new v10 config system.

**Changes Made in `src/core/Base.mjs`**

1.  **`isConfig()` Modified:**
    *   The method now checks for an active `configController` (`me.configController?.isConfig(key)`) *before* checking the prototype chain. This makes config detection more robust in the v10 architecture.

2.  **`setFields()` Modified:**
    *   This method's responsibility is now clearly defined: it identifies and immediately assigns simple public class fields (those without custom `get/set` accessors).

3.  **`set()` Refactored:**
    *   The `set()` method's logic has been re-orchestrated to process properties in a strict, explicit order that resolves the timing dependency:
        1.  **Public Fields (via `setFields()`):** Simple, value-based public fields are assigned first.
        2.  **Reactive Configs:** All reactive configs are processed next by adding them to the `configSymbol` and running `processConfigs()`.
        3.  **Public Fields with Accessors:** Fields with custom `get()`/`set()` methods are handled last. This guarantees their setters can now reliably access the final, updated values of all reactive configs from the same batch.
    *   Comprehensive JSDoc and inline comments were added to document this new, explicit order of operations.

**Benefit**

This refactoring establishes a clear and predictable order of operations within `set()`, restoring the expected behavior and ensuring that config hooks and custom field setters have a consistent and correct view of the instance's state during a batched update.

