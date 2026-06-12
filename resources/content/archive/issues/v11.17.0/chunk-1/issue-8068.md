---
id: 8068
title: Refactor Markdown Component to Handle Headline Parsing
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-09T14:15:55Z'
updatedAt: '2025-12-09T14:16:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8068'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-09T14:16:54Z'
---
# Refactor Markdown Component to Handle Headline Parsing

The `updateContentSectionsStore` method in `ContentComponent` currently handles two responsibilities: parsing headlines to add `neo-h*` classes for styling, and updating the side navigation store.

To improve separation of concerns and reuse, the headline parsing logic should be moved to the base `Neo.component.Markdown` class.

**Changes:**
1.  Move headline parsing logic (regex, `neo-h*` class injection) to `Neo.component.Markdown`.
2.  Refactor `ContentComponent` to override the parsing method to handle its store updates while delegating the core parsing to the parent class.
3.  Ensure `ContentComponent` removes the duplicated `updateContentSectionsStore` method.
4.  Remove the duplicated regex definition.

## Timeline

- 2025-12-09T14:15:56Z @tobiu added the `ai` label
- 2025-12-09T14:15:56Z @tobiu added the `refactoring` label
- 2025-12-09T14:15:57Z @tobiu added the `architecture` label
- 2025-12-09T14:16:08Z @tobiu assigned to @tobiu
- 2025-12-09T14:16:51Z @tobiu referenced in commit `50eafaa` - "Refactor Markdown Component to Handle Headline Parsing #8068"
- 2025-12-09T14:16:55Z @tobiu closed this issue

