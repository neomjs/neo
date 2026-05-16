---
id: 8570
title: Enhance Neo.mjs JSDoc to explicitly mention core/Util.mjs augmentation
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-12T01:50:21Z'
updatedAt: '2026-01-12T01:55:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8570'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T01:55:01Z'
---
# Enhance Neo.mjs JSDoc to explicitly mention core/Util.mjs augmentation

`src/core/Util.mjs` augments the global `Neo` singleton with utility methods (e.g., `Neo.isArray`, `Neo.isObject`) using `Neo.applyFromNs`.
This behavior is not currently documented in the top-level JSDoc of `src/Neo.mjs`.

**Goal:**
Update the JSDoc in `src/Neo.mjs` to explicitly state that the `Neo` namespace is enhanced by `src/core/Util.mjs` and lists the key methods provided. This ensures that AI agents (reading `Neo.mjs` on startup) and developers understand where these global utilities come from.

**Changes:**
1.  Update the `@summary` or main description of `src/Neo.mjs`.
2.  Add a note about `Neo.core.Util` augmentation.
3.  Ensure the `@borrows` tags are accurate and reflective of this relationship.

## Timeline

- 2026-01-12T01:50:22Z @tobiu added the `documentation` label
- 2026-01-12T01:50:22Z @tobiu added the `enhancement` label
- 2026-01-12T01:50:22Z @tobiu added the `ai` label
- 2026-01-12T01:54:37Z @tobiu referenced in commit `c0ef878` - "docs: Document core augmentation and Logger borrows in Neo.mjs (#8570)"
### @tobiu - 2026-01-12T01:54:45Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the `src/Neo.mjs` top-level JSDoc.
> - Added an explicit note about the `Neo` namespace being augmented by core modules (`Util`, `Compare`).
> - Clarified that importing `src/core/_export.mjs` (or specific modules) is often required to use these augmented methods.
> - Added the `@borrows` tags for `Neo.util.Logger` methods (`error`, `info`, `log`, `logError`, `warn`).
> 
> Closing as completed.

- 2026-01-12T01:55:01Z @tobiu closed this issue
- 2026-01-12T01:55:10Z @tobiu assigned to @tobiu

