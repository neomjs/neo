---
id: 7082
title: 'Feature Request: Enhance State Provider with Non-Leaf and Batched Reactivity'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-18T13:45:05Z'
updatedAt: '2025-07-18T14:12:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7082'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-18T14:12:25Z'
---
# Feature Request: Enhance State Provider with Non-Leaf and Batched Reactivity

## Problem

The `state.Provider`'s reactivity model had two primary limitations that affected complex data binding scenarios:

1.  **Lack of Non-Leaf Reactivity:** Effects that depended on a parent data object (e.g., a formula using `data.user`) were not triggered when a nested "leaf" property of that object (e.g., `data.user.name`) was modified. This made it difficult to react to changes in aggregate objects.
2.  **Non-Atomic Updates:** A single `setData()` call for a nested property could trigger multiple, unbatched effect runs—one for the leaf change and another for the "bubbled" parent update. This was inefficient and could lead to race conditions or unpredictable behavior in UI components.

These issues were discovered while debugging timing-related errors in the Calendar view, where components failed to update correctly when their underlying state properties were set during initialization.

## Solution

To address these issues and make the state management system more robust and intuitive, the following enhancements were implemented:

1.  **Reactivity Bubbling:** The `state.Provider`'s `internalSetData` method was enhanced to "bubble up" changes. When a leaf property is updated, it now recursively updates its parent objects, creating new object instances at each level. This ensures that any effect depending on an intermediate object in the data hierarchy is correctly triggered.

2.  **Atomic Batched Updates:** The public `setData()` and `setDataAtSameLevel()` methods in `state.Provider` are now wrapped with `EffectBatchManager.startBatch()` and `EffectBatchManager.endBatch()`. This guarantees that all reactive updates originating from a single `setData` call are collected, de-duplicated, and executed only once in a single, atomic operation.

## Benefits

- **Intuitive Reactivity:** Developers can now create effects and formulas that reliably react to changes in entire data objects, not just their leaf properties.
- **Improved Performance:** Batching prevents redundant effect executions, leading to more efficient rendering cycles.
- **Increased Stability:** The atomic nature of `setData` eliminates a class of potential race conditions and makes the state management system more predictable.
- **Comprehensive Test Coverage:** A new test suite (`ProviderNestedDataConfigs.mjs`) has been added to validate and protect this new functionality against future regressions.

## Timeline

- 2025-07-18T13:45:05Z @tobiu assigned to @tobiu
- 2025-07-18T13:45:07Z @tobiu added the `enhancement` label
- 2025-07-18T14:12:21Z @tobiu referenced in commit `256d933` - "Feature Request: Enhance State Provider with Non-Leaf and Batched Reactivity #7082"
- 2025-07-18T14:12:25Z @tobiu closed this issue
- 2025-07-18T14:13:29Z @tobiu referenced in commit `9bd4a6f` - "#7082 new testing file"

