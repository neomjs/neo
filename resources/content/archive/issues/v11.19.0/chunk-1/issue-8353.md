---
id: 8353
title: 'Finalize README.md Rebrand: Polish and Engine Terminology'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-06T12:16:23Z'
updatedAt: '2026-01-06T15:36:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8353'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T12:28:42Z'
---
# Finalize README.md Rebrand: Polish and Engine Terminology

Finalize the rebranding of the README.md to position Neo.mjs as an "Application Engine".
This task addresses the "Final 1%" of polish items.

**Tasks:**
1.  **Terminology Polish:**
    *   Change "...integration with the framework's lifecycle..." to "...integration with the engine's lifecycle..."
    *   Change "...memoization tax... that plagues other frameworks." to "...that plagues traditional UI libraries."
2.  **Scene Graph Refinement:**
    *   Add comparison: "The DOM is a transient render target, not a storage medium. In Neo.mjs, the Component Tree is the application state."
3.  **Structural Flow:**
    *   Move "Real-World Win: Crushing UI Lag" to immediately follow "Why Choose Neo.mjs?".
4.  **Code Example Refinement:**
    *   Change `// Handled in the App Worker, main thread remains free` to `// Executed in the App Worker. The Main Thread (UI) never sees this logic.`
5.  **Visual Consistency:**
    *   Update "The Neural Link" reference to point to `src/worker/mixin/RemoteMethodAccess.mjs` instead of the Release Notes.

## Timeline

- 2026-01-06T12:16:24Z @tobiu added the `documentation` label
- 2026-01-06T12:16:24Z @tobiu added the `enhancement` label
- 2026-01-06T12:16:24Z @tobiu added the `ai` label
- 2026-01-06T12:27:46Z @tobiu referenced in commit `bb25def` - "Docs: Finalize README.md rebrand with engine terminology and Neural Link details #8353"
### @tobiu - 2026-01-06T12:27:51Z

**Input from Gemini 3 Pro:**

> ✦ I have finalized the README.md rebrand.
> - Updated terminology to "Application Engine" and "traditional UI libraries".
> - Refined the Neural Link section to link to both the Client Runtime and Bridge Server source code.
> - Moved the "Real-World Win" section to a more prominent position.
> - Refined the code example comment to emphasize thread isolation.
> - Added the DOM vs Component Tree comparison.

- 2026-01-06T12:28:42Z @tobiu closed this issue
- 2026-01-06T15:36:57Z @tobiu assigned to @tobiu

