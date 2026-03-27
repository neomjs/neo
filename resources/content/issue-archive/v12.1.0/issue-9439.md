---
id: 9439
title: 'TreeStore: Apply "Anchor & Echo" JSDoc strategy for AI discoverability'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-11T10:52:41Z'
updatedAt: '2026-03-11T10:54:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9439'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-11T10:54:12Z'
---
# TreeStore: Apply "Anchor & Echo" JSDoc strategy for AI discoverability

### Background
The AI Knowledge Base parses and chunks source files (like `TreeStore.mjs`) by methods and properties. While the class-level documentation provided excellent context about the "Projection Architecture" and "Structural Layer", isolated method chunks (like `expand()` or `collapse()`) often lacked this semantic weight. This "Implied Context" anti-pattern leads to poor discoverability during vector searches.

### Solution: Anchor & Echo Strategy
To balance human readability with AI discoverability, we are applying the "Anchor & Echo" strategy to `TreeStore.mjs`:
1.  **The Anchor:** The class-level docblock and major overrides (`splice`, `filter`) establish high-value architectural vocabulary (e.g., "Structural Layer", "Projection Layer").
2.  **The Echo:** Smaller fields and helper methods deliberately reuse this specific vocabulary instead of generic terms.

### Changes Implemented
- **Private Maps (`#allRecordsMap`, `#childrenMap`)**: Now explicitly defined as the foundation and hierarchy of the **Structural Layer**.
- **`collapse()` & `expand()`**: Clarified that they mathematically move nodes between the **Structural Layer** and the **Projection Layer**.
- **Collection Helpers (`collectAllDescendants`, `collectVisibleDescendants`)**: Updated to state they traverse the **Structural Layer** to build the **Projection Layer** or perform deep cleanup.
- **`updateSiblingStats()`**: Anchored its purpose to operations within the **Structural Layer**.

These targeted JSDoc enhancements ensure that every chunk of `TreeStore.mjs` carries sufficient semantic weight for accurate and context-aware retrieval from the ChromaDB knowledge base.

## Timeline

- 2026-03-11T10:52:41Z @tobiu assigned to @tobiu
- 2026-03-11T10:52:42Z @tobiu added the `documentation` label
- 2026-03-11T10:52:42Z @tobiu added the `enhancement` label
- 2026-03-11T10:52:43Z @tobiu added the `ai` label
- 2026-03-11T10:53:13Z @tobiu added parent issue #9404
- 2026-03-11T10:53:30Z @tobiu referenced in commit `d0dbcc5` - "docs(data): apply Anchor & Echo JSDoc strategy to TreeStore (#9439)"
### @tobiu - 2026-03-11T10:54:11Z

Implemented the Anchor & Echo JSDoc strategy for TreeStore. Changes committed and pushed in d0dbcc500.

- 2026-03-11T10:54:12Z @tobiu closed this issue

