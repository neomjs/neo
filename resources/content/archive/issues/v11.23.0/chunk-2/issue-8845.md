---
id: 8845
title: Sync Monaco Editor Theme in Portal
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-21T10:39:36Z'
updatedAt: '2026-01-21T11:08:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8845'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T11:07:27Z'
---
# Sync Monaco Editor Theme in Portal

Update the Monaco Editor instances in the Portal App to match the selected Neo theme (Dark/Light).

**Requirements:**
1.  **Mapping:**
    *   `neo-theme-neo-dark` -> `vs-dark`
    *   `neo-theme-neo-light` -> `vs`
2.  **Implementation:**
    *   Update `src/component/wrapper/MonacoEditor.mjs`.
    *   Implement `afterSetTheme` to update the internal `editorTheme` config based on the new Neo theme.
    *   This leverages the recursive `theme` propagation in `Neo.container.Base`.


## Timeline

- 2026-01-21T10:39:37Z @tobiu added the `enhancement` label
- 2026-01-21T10:39:37Z @tobiu added the `ai` label
- 2026-01-21T10:40:07Z @tobiu added parent issue #8727
- 2026-01-21T10:52:20Z @tobiu referenced in commit `e630637` - "feat: Sync Monaco Editor Theme in Portal (#8845)"
### @tobiu - 2026-01-21T11:05:25Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the automatic theme synchronization for the Monaco Editor wrapper.
> 
> **Changes:**
> 1.  **New Config:** Added `useThemeAwareness_` (Boolean, default `true`) to `src/component/wrapper/MonacoEditor.mjs`. This allows developers to opt-out of automatic theme mapping if they need a specific, fixed editor theme regardless of the application theme.
> 2.  **Theme Mapping Logic:** Implemented `afterSetTheme`. It detects changes to the inherited `theme` config (propagated by `container.Base`), maps it (`dark` -> `vs-dark`, `light` -> `vs`), and updates the `editorTheme` config accordingly. This ensures both initial rendering and runtime switches are handled correctly.
> 3.  **Dynamic Toggling:** Implemented `afterSetUseThemeAwareness` to immediately apply the current theme if the feature is enabled at runtime.
> 
> This solution provides a "batteries-included" experience for the Portal App and all other Neo.mjs applications using this wrapper, while maintaining flexibility.

- 2026-01-21T11:07:27Z @tobiu closed this issue
- 2026-01-21T11:08:17Z @tobiu assigned to @tobiu

