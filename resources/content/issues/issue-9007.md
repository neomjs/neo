---
id: 9007
title: 'Feat: Enhance DevRank Grid Styling (Dark Theme)'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-05T18:38:48Z'
updatedAt: '2026-02-05T19:33:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9007'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-05T19:33:24Z'
---
# Feat: Enhance DevRank Grid Styling (Dark Theme)

To enhance the visual appeal of the DevRank application and match the "neo-theme-neo-dark" aesthetic, we will update the Grid styling.

**Goals:**
1.  **Color Palette:** Replace the "gray-ish" look with dark blue/purple tones.
    -   Even rows: Change from `gray-800` to a dark purple/blue shade (e.g., `purple-950` or `purple-900`).
    -   Header Buttons: Use a blue/purple background similar to custom tab headers.
2.  **Typography:** Adjust font size (currently feels too big).
3.  **Layout/Spacing:** Fix alignment issues between headers and cells (headers start too far right). Match padding.

**Target Files:**
-   `resources/scss/theme-neo-dark/grid/Container.scss`
-   `resources/scss/theme-neo-dark/grid/Body.scss`
-   `resources/scss/theme-neo-dark/grid/header/Button.scss`


## Timeline

- 2026-02-05T18:38:49Z @tobiu added the `enhancement` label
- 2026-02-05T18:38:49Z @tobiu added the `design` label
- 2026-02-05T18:38:49Z @tobiu added the `ai` label
- 2026-02-05T19:32:01Z @tobiu referenced in commit `a4364e4` - "feat: Enhance Grid styling for neo-theme-neo-dark (#9007)"
- 2026-02-05T19:32:12Z @tobiu added parent issue #8930
- 2026-02-05T19:32:19Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-05T19:32:56Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the grid styling enhancements for the `neo-theme-neo-dark` theme.
> 
> **Summary of Changes:**
> 
> 1.  **Grid Header Buttons:**
>     *   **Colors:** Updated to use `purple-900` (bg) and `purple-500` (hover). Text and glyphs now turn white on hover for better contrast.
>     *   **Layout:** Changed alignment to `start` (left-aligned) and updated padding to `0 10px` to fix visual alignment with cells.
>     *   **Typography:** Reduced font weight to `400` (matching cells) and font size to `13px`.
>     *   **Implementation:** Explicitly targeted `.neo-button-text` styles to override default button base styles.
> 
> 2.  **Grid Container:**
>     *   **Colors:** Updated border colors to `purple-800`.
>     *   **Rows:** Even rows now use `purple-950` background.
>     *   **Typography:** Standardized font size to `13px`.
> 
> 3.  **Grid Body:**
>     *   **Selection:** Updated selection colors to a rich `purple-600` (cell) and `purple-700` (row context).
>     *   **Hover:** Updated row hover color to `purple-900` for a subtle, high-end feel.
>     *   **Readability:** Selected text color is now explicitly set to white (`text-neutral-contrast`).
> 
> 4.  **Cross-Theme Compatibility:**
>     *   Introduced new CSS variables (`--grid-header-button-justify-content`, `--grid-header-button-padding`, `--grid-container-font-size`, etc.) into the source SCSS files.
>     *   Updated all other themes (`dark`, `light`, `neo-light`, `cyberpunk`) to define these variables with their original values, ensuring no visual regressions occurred outside of `neo-dark`.
> 
> The grid now features a polished, professional dark blue/purple aesthetic consistent with the Portal app's new design language.

- 2026-02-05T19:33:24Z @tobiu closed this issue

