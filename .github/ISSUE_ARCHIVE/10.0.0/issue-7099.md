---
id: 7099
title: >-
  Refactor `state.Provider` to Support Intuitive Deep-Merging and Runtime Data
  Creation
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-22T18:02:47Z'
updatedAt: '2025-07-22T18:03:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7099'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-22T18:03:34Z'
---
# Refactor `state.Provider` to Support Intuitive Deep-Merging and Runtime Data Creation

**Reported by:** @tobiu on 2025-07-22

### **Description**

The `state.Provider`'s `setData()` method exhibits a counter-intuitive behavior when passed a nested object. A call like `provider.setData({ user: { firstname: 'Jane' } })` currently **replaces** the entire `user` object, leading to the unintentional removal of other properties (e.g., `lastname`). This behavior is not only a potential source of bugs but also contradicts the hint in the official `StateProviders.md` guide, which suggests a merge operation occurs.

This ticket proposes a refactoring of the core `setData` logic to implement a more intuitive and powerful **"drill-in and merge"** paradigm. This will make the API more predictable, align it with the documentation, and enable the dynamic creation of new, fully reactive data structures at runtime.

### **Problem Statement**

1.  **Counter-intuitive API:** The current replacement behavior is unexpected. Developers naturally assume such an operation would perform a deep merge, updating `firstname` while preserving `lastname`.

2.  **Inconsistent Behavior:** The behavior of `setData({ user: {...} })` is inconsistent with `setData({'user.firstname': ...})`, where the latter correctly preserves sibling properties via "reactivity bubbling."

3.  **Incorrect Documentation:** The guide in `learn/guides/datahandling/StateProviders.md` provides misleading information, creating a trap for developers.

4.  **Architectural Limitation:** The inability to deep-merge makes it impossible to dynamically create new, fully reactive nested data structures at runtime (e.g., `setData({ newConfig: { theme: 'dark' } })`).

### **Proposed Solution**

The `internalSetData` method in `src/state/Provider.mjs` will be refactored to implement the following logic:

1.  **Unconditional Drill-Down:** When `internalSetData` receives a plain JavaScript object as a value (e.g., `{ firstname: 'Jane' }` for the key `'user'`), it will recursively call itself for each property within that object, creating the full path (e.g., `'user.firstname'`).

2.  **Atomic Records:** This drill-down logic will explicitly check that the value is a plain object (`Neo.typeOf(value) === 'Object'`), ensuring that `Neo.data.Record` instances are correctly treated as atomic leaf values and are not drilled into.

3.  **Consistent Bubbling:** After any leaf-node value is set (whether it's a primitive or a `Record`), the existing "reactivity bubbling" logic will execute. This ensures that parent objects are updated, triggering all relevant effects correctly and consistently.

This change ensures that all methods of setting data (`proxy.prop = value`, `setData({prop: value})`, `setData({'prop.path': value})`) converge on the same robust and predictable underlying behavior.

### **Acceptance Criteria**

1.  **Code Implementation:**
    *   The `internalSetData` method in `src/state/Provider.mjs` is updated to reflect the "drill-in and merge" logic described above.

2.  **Testing:**
    *   A new test case is added to `test/siesta/tests/state/ProviderNestedDataConfigs.mjs` that explicitly asserts that `provider.setData({ user: { firstname: 'Jane' } })` correctly merges the data and preserves `user.lastname`.
    *   All existing tests in `Provider.mjs` and `ProviderNestedDataConfigs.mjs` must continue to pass.

3.  **Documentation:**
    *   The incorrect hint in `learn/guides/datahandling/StateProviders.md` must be removed. The section should be updated to accurately describe the deep-merge behavior.
    *   The code examples in the blog post `learn/blog/v10-deep-dive-state-provider.md` must be updated to demonstrate and explain the correct, intuitive API usage.

