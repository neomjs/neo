---
id: 8756
title: Refactor Mermaid Theming to use YAML Frontmatter Injection
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
  - performance
assignees:
  - tobiu
createdAt: '2026-01-17T10:49:14Z'
updatedAt: '2026-01-17T11:03:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8756'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T11:03:24Z'
---
# Refactor Mermaid Theming to use YAML Frontmatter Injection

Refactor the Mermaid integration to use diagram-specific YAML frontmatter configuration instead of global re-initialization.

**Current State:**
The Main Thread Addon maintains a `currentTheme` state and calls `mermaid.initialize({ theme })` whenever a diagram requests a different theme. This is global and affects all diagrams.

**New Architecture:**
1.  **Wrapper Component (`Neo.component.wrapper.Mermaid`):**
    -   Owns the `themeMap` (Neo Theme -> Mermaid Theme).
    -   Dynamically prepends the YAML frontmatter to the diagram code string before sending it to the addon.
    -   Example:
        ```mermaid
        ---
        config:
          theme: dark
        ---
        graph TD...
        ```

2.  **Main Thread Addon (`Neo.main.addon.Mermaid`):**
    -   Removes all theme-specific logic (`themeMap`, `currentTheme`, `initialize`).
    -   Simply calls `mermaid.render()` with the code provided by the wrapper.

**Benefits:**
-   **Isolation:** Multiple diagrams with different themes can coexist.
-   **Performance:** Removes costly global re-initialization.
-   **Separation of Concerns:** The App Worker handles business logic (theming), Main Thread handles rendering.

## Timeline

- 2026-01-17T10:49:15Z @tobiu added the `ai` label
- 2026-01-17T10:49:16Z @tobiu added the `refactoring` label
- 2026-01-17T10:49:16Z @tobiu added the `architecture` label
- 2026-01-17T10:49:16Z @tobiu added the `performance` label
- 2026-01-17T10:51:16Z @tobiu referenced in commit `9bcaa17` - "refactor: Implement Mermaid YAML Frontmatter Theming (#8756)"
- 2026-01-17T10:51:21Z @tobiu assigned to @tobiu
- 2026-01-17T10:57:49Z @tobiu referenced in commit `bce0aa5` - "feat: Move mermaidTheme to static config to enable prototype overwrites (#8756)"
### @tobiu - 2026-01-17T10:57:51Z

**Input from Gemini 3 Pro:**

> ✦ I have refined the `Neo.component.wrapper.Mermaid` implementation based on the code review.
> 
> **Refinement:**
> -   Moved the `mermaidTheme` property from a class field to the `static config` block.
> -   **Why:** This allows the `mermaidTheme` default value to be overridden globally via `Neo.overwrites`, consistent with the framework's configuration architecture.
> 
> **Status:**
> The implementation is now complete, including dynamic theming, manual overrides, and correct architectural placement of configs.

- 2026-01-17T11:03:24Z @tobiu closed this issue

