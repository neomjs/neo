---
id: 7898
title: Add 'doesNotStartWith' operator to Neo.collection.Filter
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-24T13:35:31Z'
updatedAt: '2025-11-24T13:54:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7898'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-24T13:38:12Z'
---
# Add 'doesNotStartWith' operator to Neo.collection.Filter

To support advanced filtering scenarios, such as excluding certain classes from the Docs app tree view (e.g., `Neo.ai` classes that are not real source code), we need a `doesNotStartWith` operator in `Neo.collection.Filter`.

Currently, `Neo.collection.Filter` supports `startsWith`, but lacks the inverse operation.

## Goal
Add `doesNotStartWith` to the `operators` static array and implement the corresponding static method in `Neo.collection.Filter`.

## Implementation Details
1.  Add `'doesNotStartWith'` to `Neo.collection.Filter.operators`.
2.  Implement `static ['doesNotStartWith'](a, b)` logic.
    - It should return `true` if string `a` does **not** start with string `b`.
    - Should handle non-string inputs gracefully (e.g., coerce to string or return safe default).
    - Should likely be case-insensitive to match `startsWith` behavior (check `startsWith` implementation for consistency).

## Example Usage
```javascript
// Filter out items that start with 'Neo.ai'
store.filter({
    property: 'className',
    operator: 'doesNotStartWith',
    value: 'Neo.ai'
});
```

## Timeline

- 2025-11-24T13:35:33Z @tobiu added the `enhancement` label
- 2025-11-24T13:35:52Z @tobiu assigned to @tobiu
- 2025-11-24T13:35:55Z @tobiu added the `ai` label
- 2025-11-24T13:38:05Z @tobiu referenced in commit `55dad0c` - "Add 'doesNotStartWith' operator to Neo.collection.Filter #7898"
- 2025-11-24T13:38:12Z @tobiu closed this issue

