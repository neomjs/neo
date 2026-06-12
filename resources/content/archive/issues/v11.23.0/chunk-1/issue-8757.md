---
id: 8757
title: Fix Mermaid Diagram Text Truncation and Sizing
state: CLOSED
labels:
  - bug
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T11:03:12Z'
updatedAt: '2026-01-17T12:23:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8757'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T12:23:51Z'
---
# Fix Mermaid Diagram Text Truncation and Sizing

I've identified a rendering issue where Mermaid diagram text can be cut off even when the parent container has sufficient space.

**Symptoms:**
-   Text inside nodes or labels is truncated or clipped.
-   The diagram width seems constrained or miscalculated.

**Potential Causes:**
-   Missing CSS to force the SVG to scale (e.g., `width: 100%`, `height: auto`).
-   Mermaid internal width calculation conflicts with Neo.mjs layout sizing.

**Proposed Fix:**
1.  Verify the current CSS for `.neo-mermaid svg`.
2.  Add responsive styling rules to `Neo.component.wrapper.Mermaid` (via SCSS or style config) to ensure the SVG fills its container:
    ```css
    .neo-mermaid svg {
        width: 100%;
        height: auto;
        max-width: 100%;
    }
    ```
3.  Investigate if `mermaid.render` config needs `useMaxWidth: false` or similar adjustments.

**Scope:**
-   Check `resources/scss` files.
-   Check `src/component/wrapper/Mermaid.mjs`.

## Timeline

- 2026-01-17T11:03:14Z @tobiu added the `bug` label
- 2026-01-17T11:03:14Z @tobiu added the `design` label
- 2026-01-17T11:03:14Z @tobiu added the `ai` label
- 2026-01-17T12:22:52Z @tobiu referenced in commit `4988ecd` - "fix: Resolve Mermaid text cutoff by forcing re-processing in DOM context (#8757)"
### @tobiu - 2026-01-17T12:22:57Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved the Mermaid text truncation issue.
> 
> **Diagnosis:**
> The previous attempt using `mermaid.render()` generated SVGs in a detached context, leading to incorrect font measurements and clipped text. The SVG `max-width` was also a symptom, not the root cause.
> 
> **Solution:**
> 1.  **Revert to `mermaid.run()`**: This method renders the diagram directly in the DOM, allowing Mermaid to measure the actual rendered fonts and container dimensions.
> 2.  **Force Re-processing**: The critical fix was explicitly removing the `data-processed` attribute (`element.removeAttribute('data-processed')`) before calling `run()`. This tricks Mermaid into treating the existing element as a new diagram, enabling updates without destroying the container.
> 3.  **SCSS**: The `resources/scss/src/component/wrapper/Mermaid.scss` file is kept but empty for now, preserving the file structure for future styling if needed.
> 
> This approach ensures correct layout calculation and supports dynamic updates.

- 2026-01-17T12:23:52Z @tobiu closed this issue
- 2026-01-17T12:23:53Z @tobiu assigned to @tobiu

