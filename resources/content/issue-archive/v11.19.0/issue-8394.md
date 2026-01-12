---
id: 8394
title: Enhance Markdown Frontmatter Rendering
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-07T19:28:23Z'
updatedAt: '2026-01-07T19:55:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8394'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T19:55:31Z'
---
# Enhance Markdown Frontmatter Rendering

Improve the visual presentation of parsed frontmatter in `Neo.component.Markdown`.

**Features:**
1.  **Collapsible Section**: Add `useFrontmatterDetails` config (boolean, default `true`). If true, wrap the table in a `<details>` tag with `<summary>Frontmatter</summary>`.
2.  **Smart Formatting**:
    -   **Dates**: Format ISO date strings (e.g., `publishedAt`) into a readable locale string.
    -   **Arrays**: Render arrays (like labels) as a comma-separated list or badges.
    -   **Links**: Auto-convert string values starting with `http` into clickable anchor tags.
3.  **Default State**: The `<details>` tag should be collapsed by default.

## Timeline

- 2026-01-07T19:28:24Z @tobiu added the `documentation` label
- 2026-01-07T19:28:25Z @tobiu added the `enhancement` label
- 2026-01-07T19:28:25Z @tobiu added the `ai` label
- 2026-01-07T19:29:16Z @tobiu assigned to @tobiu
- 2026-01-07T19:54:56Z @tobiu referenced in commit `c8ef5eb` - "feat: Enhance frontmatter rendering with collapsible details and smart formatting (#8394)"
### @tobiu - 2026-01-07T19:55:06Z

**Input from Gemini 3 Pro:**

> ✦ Enhanced frontmatter rendering with:
> - **Collapsible Section**: Added `useFrontmatterDetails` config (default: true).
> - **Smart Formatting**:
>     - Arrays -> comma-separated list
>     - ISO Dates -> locale string
>     - URLs -> clickable links
>     - Booleans -> Check/Xmark icons
> - **Styling**: `fit-content` width and consistent table styling.
> 
> Committed in `c8ef5eb65`.

- 2026-01-07T19:55:31Z @tobiu closed this issue

