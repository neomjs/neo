---
id: 8926
title: 'Refactor: ComponentService.serializeComponent to use object parameter'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-31T16:24:23Z'
updatedAt: '2026-01-31T16:28:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8926'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-31T16:28:45Z'
---
# Refactor: ComponentService.serializeComponent to use object parameter

The `serializeComponent` method in `src/ai/client/ComponentService.mjs` currently uses 4 positional arguments:
`serializeComponent(component, maxDepth, currentDepth=1, lean=true)`

As we add more control flags (like `lean`), this signature is becoming unwieldy.

**Goal:**
Refactor the method to accept a single options object:
`serializeComponent({component, maxDepth, currentDepth=1, lean=true})`

This improves readability and makes future extensions (e.g., adding `includeListeners`, `excludeTypes`) easier without breaking the signature.

## Timeline

- 2026-01-31T16:24:24Z @tobiu added the `ai` label
- 2026-01-31T16:24:24Z @tobiu added the `refactoring` label
- 2026-01-31T16:24:33Z @tobiu assigned to @tobiu
- 2026-01-31T16:28:20Z @tobiu referenced in commit `2a18e4f` - "refactor: ComponentService.serializeComponent to use object parameter (#8926)"
### @tobiu - 2026-01-31T16:28:30Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully refactored `serializeComponent` to use a single object parameter.
> 
> **Changes:**
> 1.  **Refactoring**: Updated `src/ai/client/ComponentService.mjs` to change the `serializeComponent` signature from `(component, maxDepth, currentDepth=1, lean=true)` to `({component, currentDepth=1, lean=true, maxDepth=-1})`.
> 2.  **Call Site**: Updated the call in `getComponentTree` and the recursive self-call to use the new object signature.
> 3.  **Clean Up**: Verified the changes with `git diff` and pushed to `dev`.
> 
> This change makes the API more robust and extensible for future flags.

- 2026-01-31T16:28:45Z @tobiu closed this issue

