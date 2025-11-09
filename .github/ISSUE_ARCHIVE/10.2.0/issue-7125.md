---
id: 7125
title: 'ComboBox: Optimize afterSetValue Selection Handling for SingleSelect'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-29T21:47:33Z'
updatedAt: '2025-07-29T21:49:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7125'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-29T21:49:02Z'
---
# ComboBox: Optimize afterSetValue Selection Handling for SingleSelect

**Reported by:** @tobiu on 2025-07-29

**Description:**

The `afterSetValue` method in `Neo.form.field.ComboBox` contains a redundant call to `selectionModel?.deselect(oldValue)` when `singleSelect` is enabled.

**Current Code (src/form/field/ComboBox.mjs, afterSetValue method):**
```javascript
if (me._picker?.isVisible) {
    let selectionModel = me.list?.selectionModel;

    if (value) {
        oldValue && selectionModel?.deselect(oldValue); // <-- This line is redundant when singleSelect is true
        selectionModel?.select(value)
    } else {
        selectionModel.deselectAll()
    }
}
```

**Problem:**
When `selectionModel.singleSelect` is `true` (which is the default for `ComboBox`), the `selectionModel.select(value)` method itself handles the deselection of any previously selected item. Therefore, explicitly calling `selectionModel?.deselect(oldValue)` before `select(value)` is unnecessary. This leads to:
*   Redundant method calls.
*   Potentially unnecessary `view.update()` calls and `selectionChange` events from the `selectionModel`.

**Proposed Change:**
Remove the line `oldValue && selectionModel?.deselect(oldValue);` from the `afterSetValue` method in `src/form/field/ComboBox.mjs`.

**Reasoning:**
The `selectionModel.select()` method, when `singleSelect` is true, is designed to ensure only one item is selected. It will internally deselect any existing selection before applying the new one. Removing the redundant `deselect` call will streamline the selection logic, improve efficiency, and prevent potential unnecessary event emissions from the `selectionModel`.

