---
id: 7153
title: Introduce `attributeNameMap` for Robust Attribute Handling
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-01T13:01:29Z'
updatedAt: '2025-08-01T13:02:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7153'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-01T13:02:13Z'
---
# Introduce `attributeNameMap` for Robust Attribute Handling

**Reported by:** @tobiu on 2025-08-01

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

### 1. Summary

Refactored `src/functional/util/HtmlTemplateProcessor.mjs` to use an `attributeNameMap` instead of a flat array for storing original attribute names. This change ensures correct mapping of dynamic values to their corresponding attributes, especially in complex scenarios involving nested templates and conditional rendering.

### 2. Rationale

Previously, the `HtmlTemplateProcessor` relied on a simple array (`attributeNames`) to track the original, case-sensitive names of attributes associated with dynamic values. This approach was prone to index shifting issues when falsy values were skipped or when nested templates were flattened, leading to incorrect attribute assignments (e.g., `handler` being mapped to `style`). By introducing an `attributeNameMap` that directly associates the dynamic value's index with its attribute name, we eliminate these synchronization problems, making the attribute parsing robust and reliable.

### 3. Scope & Implementation Plan

1.  **Modify `flattenTemplate`:** Change its return type to include an `attributeNameMap` (an object) instead of an `attributeNames` array.
2.  **Populate `attributeNameMap`:** Store `dynamicValueIndex: attributeName` pairs in the map within `flattenTemplate`, ensuring the `attrMatch` is recorded at the precise index where its corresponding dynamic value is pushed to `flatValues`.
3.  **Handle Nested Templates:** When flattening nested templates, adjust the keys of the nested `attributeNameMap` before merging them into the parent's map to maintain unique and correct indices across the entire flattened structure.
4.  **Update `convertNodeToVdom`:** Modify this method to retrieve the correct attribute name from the `attributeNameMap` using the dynamic value's index, rather than relying on a sequential `attrNameIndex`.
5.  **Update JSDoc:** Ensure all relevant JSDoc comments reflect the change from `attributeNames` to `attributeNameMap`.

### 4. Definition of Done

-   `src/functional/util/HtmlTemplateProcessor.mjs` uses `attributeNameMap` for attribute name tracking.
-   The `style` vs `handler` bug (and similar attribute mapping issues) is resolved.
-   The attribute mapping logic is robust against nested templates and conditional rendering.
-   All related JSDoc comments are updated to reflect the new `attributeNameMap` parameter.

