---
id: 8426
title: Clean up SourceParser and use Class Hierarchy
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-08T13:50:13Z'
updatedAt: '2026-01-08T13:53:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8426'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T13:53:11Z'
---
# Clean up SourceParser and use Class Hierarchy

Now that `docs/output/class-hierarchy.json` is the single source of truth for the class hierarchy, the `SourceParser` logic can be simplified and improved.

**Issues:**
1.  **Remove Flawed Logic:** The `SourceParser` still contains the heuristic logic for resolving `superClass` (imports map + path resolution + heuristic app naming) which was deemed "messed up". This should be removed.
2.  **Use Hierarchy File:** Instead of guessing the `superClass` from imports, `SourceParser` (or rather `ApiSource` calling it) should look up the `extends` property from the authoritative `class-hierarchy.json`.

**Plan:**
1.  **Refactor `SourceParser.mjs`:**
    *   Remove the complex import mapping and heuristic resolution logic for `superClass`.
    *   Accept an optional `hierarchy` object in the `parse()` method arguments.
    *   If `hierarchy` is provided, look up the `extends` value using the extracted `className`.
    *   Fallback: If not in hierarchy, leave `extends` empty or null (better than guessing wrong).
2.  **Refactor `ApiSource.mjs`:**
    *   Load `docs/output/class-hierarchy.json` at the start of `extract()`.
    *   Pass this hierarchy map to `SourceParser.parse()`.

**Goal:**
Ensure vector metadata (`className` and `extends`) is populated using the authoritative hierarchy data, removing all "hallucinated" heuristics.

## Timeline

- 2026-01-08T13:50:15Z @tobiu added the `ai` label
- 2026-01-08T13:50:15Z @tobiu added the `refactoring` label
- 2026-01-08T13:51:00Z @tobiu assigned to @tobiu
- 2026-01-08T13:52:36Z @tobiu referenced in commit `90db17b` - "refactor: Cleanup SourceParser and use Class Hierarchy (#8426)"
### @tobiu - 2026-01-08T13:52:48Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `SourceParser` and `ApiSource` to implement a clean, authoritative inheritance resolution.
> 
> **Changes:**
> 1.  **`SourceParser.mjs`:** Removed the flawed import-mapping and heuristic `superClass` resolution logic. It now accepts an optional `hierarchy` object and performs a simple O(1) lookup: `superClass = hierarchy[className]`.
> 2.  **`ApiSource.mjs`:** Now loads `docs/output/class-hierarchy.json` at the beginning of the extraction process and passes it to `SourceParser.parse()`. It includes a warning if the hierarchy file is missing (to avoid silent failures).
> 
> This ensures that the vector metadata (`extends`) matches the authoritative JSDoc-generated hierarchy, removing all hallucinated or guessed relationships.

- 2026-01-08T13:53:11Z @tobiu closed this issue

