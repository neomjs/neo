---
id: 8420
title: Fix Knowledge Base Indexing and Scoring for Source Code
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T12:02:18Z'
updatedAt: '2026-01-08T12:05:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8420'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T12:05:14Z'
---
# Fix Knowledge Base Indexing and Scoring for Source Code

The recent switch to `SourceParser` (Issue #8342) broke the inheritance chain resolution in `VectorService` and the scoring logic in `QueryService`.

**Issues:**
1.  `SourceParser` does not extract/emit `className` or `extends` metadata in the chunks.
2.  `VectorService` looks for `chunk.kind === 'class'` to build the inheritance map, which no longer exists.
3.  `QueryService` boosts scores for `metadata.type === 'class'`, but source files now have `type === 'src'`.

**Tasks:**
1.  **Update `SourceParser.mjs`**:
    *   Extract `className` and `superClass` from the AST.
    *   Include `className` and `extends` metadata in all generated chunks.
2.  **Update `VectorService.mjs`**:
    *   Adapt logic to read `className` and `extends` from the new chunk structure to rebuild the inheritance map.
3.  **Update `QueryService.mjs`**:
    *   Adjust scoring logic to recognize `type: 'src'` and boost based on `className` match (replacing the dead `type === 'class'` check).

**Goal:** Restore intelligent scoring and inheritance-based boosting for source code queries.

## Timeline

- 2026-01-08T12:02:20Z @tobiu added the `bug` label
- 2026-01-08T12:02:20Z @tobiu added the `ai` label
- 2026-01-08T12:02:57Z @tobiu assigned to @tobiu
- 2026-01-08T12:04:41Z @tobiu referenced in commit `b284f2e` - "fix: KB indexing & scoring for source code (#8420)"
### @tobiu - 2026-01-08T12:04:54Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `SourceParser`, `VectorService`, and `QueryService` to correctly handle source code indexing.
> 
> **Changes:**
> 1.  **`SourceParser.mjs`:** Now extracts `className` and `extends` from the AST and injects them into *every* chunk generated for a class file.
> 2.  **`VectorService.mjs`:** Updated to build the inheritance map using the `module-context` chunks (which now contain the metadata) and applies the chain to all chunks with a `className`.
> 3.  **`QueryService.mjs`:** Removed the obsolete `metadata.type === 'class'` check. It now correctly boosts scores based on `metadata.className` matches, ensuring `src` files are properly ranked.
> 
> This restores the "Inheritance Boosting" and class-name relevance scoring that was lost during the switch to source code parsing.

- 2026-01-08T12:05:14Z @tobiu closed this issue

