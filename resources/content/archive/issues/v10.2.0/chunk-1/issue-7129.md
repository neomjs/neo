---
id: 7129
title: Refactor fireChangeEvent to be Synchronous and Review Event Handler Timing
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-30T10:47:32Z'
updatedAt: '2025-07-30T10:50:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7129'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-30T10:50:42Z'
---
# Refactor fireChangeEvent to be Synchronous and Review Event Handler Timing

This ticket outlines necessary improvements to the framework's event handling to resolve timing-related issues and prevent race conditions.

## 1. Make `fireChangeEvent` Synchronous

**Problem:**
The `fireChangeEvent` method in `src/form/field/ComboBox.mjs` is asynchronous, which has been identified as the root cause of bugs in the Covid application. Dependent logic executes before the component's value is updated, leading to state inconsistencies.

**Solution:**
Refactor `fireChangeEvent` to be fully synchronous. This ensures that when the `change` event is fired, its listeners are executed immediately, guaranteeing that the component's state is consistent.

**Files to Change:**
- `src/form/field/ComboBox.mjs`
- Potentially `src/form/field/Base.mjs` where the original method is defined.

## 2. Use `delayable` for Expensive Calculations in Event Handlers

**Problem:**
In components with expensive event handlers, such as `examples/grid/bigData/ControlsContainer.mjs`, rapid-firing events can trigger heavy calculations before the input field's value has been updated in the component's state. This can lead to race conditions or calculations being performed with stale data.

**Solution:**
Apply a `delayable` configuration to buffer the execution of event handlers that trigger these calculations. This ensures that there is a slight delay (e.g., one frame), allowing the component's input value and state to be updated before the expensive logic runs.

**Example from `examples/grid/bigData/ControlsContainer.mjs`:**
```javascript
static delayable = {
    onAmountColumnsChange    : {type: 'buffer', timer: 30},
    onAmountRowsChange       : {type: 'buffer', timer: 30},
    onBufferColumnRangeChange: {type: 'buffer', timer: 30},
    onBufferRowRangeChange   : {type: 'buffer', timer: 30}
}
```

## Action Items

1.  Modify `fireChangeEvent` in `src/form/field/ComboBox.mjs` and any relevant base classes to be synchronous.
2.  Verify the fix in the Covid application.
3.  Review components with performance-intensive event handlers and apply the `delayable` pattern as needed.

## Timeline

- 2025-07-30T10:47:33Z @tobiu assigned to @tobiu
- 2025-07-30T10:47:34Z @tobiu added the `enhancement` label
- 2025-07-30T10:50:31Z @tobiu referenced in commit `7ee52ae` - "Refactor fireChangeEvent to be Synchronous and Review Event Handler Timing #7129"
- 2025-07-30T10:50:42Z @tobiu closed this issue
- 2025-07-30T10:52:01Z @tobiu cross-referenced by #7123

