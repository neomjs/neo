---
id: 7691
title: 'Refactor: Harden Memory Core DB services against undefined `where` clauses'
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-02T16:40:14Z'
updatedAt: '2025-11-02T16:44:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7691'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-02T16:44:41Z'
---
# Refactor: Harden Memory Core DB services against undefined `where` clauses

**Reported by:** @tobiu on 2025-11-02

This ticket documents a series of fixes to improve the robustness of our ChromaDB query services within the Memory Core. The ChromaDB client throws an error when a `where` clause is constructed with an `undefined` value (e.g., `where: { category: undefined }`).

To address this, the following changes were made:

1.  **`SummaryService.mjs` (`querySummaries`):**
    *   Refactored to conditionally build the `query` object. The `where` clause is now only added if a `category` is provided.

2.  **`MemoryService.mjs` (`queryMemories`):**
    *   Applied the same conditional query construction pattern. The `where` clause is only added if a `sessionId` is provided.

3.  **`MemoryService.mjs` (`listMemories`):**
    *   Added a guard clause to exit early if `sessionId` is falsy, preventing an invalid query.

4.  **`SessionService.mjs` (`summarizeSession`):**
    *   Added a guard clause to exit early if `sessionId` is falsy. This is a critical safety check to prevent the service from accidentally summarizing the entire memory collection.

5.  **`SessionService.mjs` (`findUnsummarizedSessions`):**
    *   Added a `.filter(Boolean)` to the list of session IDs. This ensures that any `null` or `undefined` session IDs are removed at the source, preventing invalid data from being passed to downstream methods.

These changes collectively prevent a class of potential runtime errors and make the data service layer more resilient.

