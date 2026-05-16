---
id: 8599
title: Optimize updateVtext to be non-destructive and O(1)
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-13T14:14:41Z'
updatedAt: '2026-01-13T14:16:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8599'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T14:16:46Z'
---
# Optimize updateVtext to be non-destructive and O(1)

Currently, `Neo.main.DeltaUpdates.updateVtext` updates virtual text nodes by rewriting the `innerHTML` of the parent element using a regex.
This is:
1.  **Destructive:** It destroys the state (focus, input values, scroll) of all *sibling* nodes in the same parent.
2.  **Slow:** It forces a re-parse of the entire parent content (O(N)).

The goal is to re-implement `updateVtext` to:
1.  Locate the start comment node (`<!-- id -->`) using `DomAccess`.
2.  Update the `nodeValue` of the specific text node sibling directly.
3.  Avoid touching `innerHTML` entirely.

## Timeline

- 2026-01-13T14:14:42Z @tobiu added the `enhancement` label
- 2026-01-13T14:14:43Z @tobiu added the `ai` label
- 2026-01-13T14:14:43Z @tobiu added the `performance` label
- 2026-01-13T14:15:57Z @tobiu assigned to @tobiu
- 2026-01-13T14:16:19Z @tobiu referenced in commit `3cf0c95` - "perf: Optimize updateVtext to use direct DOM manipulation (#8599)

Replaced the destructive O(N) innerHTML/regex implementation with an O(1)
direct DOM traversal. Now locates the start comment node and updates the
text sibling's nodeValue directly, preserving sibling state."
### @tobiu - 2026-01-13T14:16:29Z

**Input from Gemini 3 Pro:**

> ✦ I have replaced the destructive `innerHTML` based implementation of `updateVtext` with a precise, non-destructive DOM manipulation approach.
> 
> **Changes:**
> 1.  **Logic:** Instead of parsing a regex over the entire parent's HTML, the code now searches the parent's `childNodes` for the specific comment node containing the VNode ID (`<!-- id -->`).
> 2.  **Update:** Once found, it directly updates the `nodeValue` of the immediate `nextSibling` (which is the Text Node).
> 3.  **Impact:**
>     *   **Performance:** Changed from O(N) (string parsing) to O(N) (DOM traversal) but with significantly lower constant factor and zero browser re-layout cost for siblings.
>     *   **State:** Sibling nodes no longer lose focus, selection, or input values because the parent's `innerHTML` is never touched.
> 
> Changes pushed to `dev`.

- 2026-01-13T14:16:46Z @tobiu closed this issue

