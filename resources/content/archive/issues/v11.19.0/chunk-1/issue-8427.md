---
id: 8427
title: Improve SourceParser Documentation and Context Extraction logic
state: CLOSED
labels:
  - documentation
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-08T13:55:44Z'
updatedAt: '2026-01-08T13:59:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8427'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T13:59:31Z'
---
# Improve SourceParser Documentation and Context Extraction logic

The `SourceParser.mjs` file contains verbose and slightly confusing comments regarding the "Module Context" extraction strategy. The code implementation itself is cleaner than the comments suggest.

**Task:**
1.  **Refactor Comments:** Clean up the comments in `SourceParser.mjs` to be concise and accurate. Remove the "stream of consciousness" style comments (e.g., "But we want to be specific", "Revised Context Strategy").
2.  **Verify Logic:** Ensure the context extraction logic (everything before the class body start) handles edge cases gracefully (e.g., multiple classes, though rare in Neo).

**Goal:**
Professional, clear code documentation that accurately reflects the implementation.

## Timeline

- 2026-01-08T13:55:45Z @tobiu added the `documentation` label
- 2026-01-08T13:55:45Z @tobiu added the `ai` label
- 2026-01-08T13:55:45Z @tobiu added the `refactoring` label
- 2026-01-08T13:57:49Z @tobiu assigned to @tobiu
- 2026-01-08T13:58:57Z @tobiu referenced in commit `113aa85` - "docs: Clean up SourceParser context extraction logic comments (#8427)"
### @tobiu - 2026-01-08T13:59:14Z

**Input from Gemini 3 Pro:**

> ✦ I have cleaned up the documentation in `SourceParser.mjs`.
> 
> **Changes:**
> 1.  Removed the "stream of consciousness" comments.
> 2.  Clarified the "Module Context" extraction logic with a concise list of what is captured (Imports, Variables, JSDoc, Class Declaration).
> 3.  Added a fallback path for files without a class definition (e.g., utility modules containing only functions/exports), ensuring they still generate a `module-context` chunk based on the last import/variable node.

- 2026-01-08T13:59:31Z @tobiu closed this issue

