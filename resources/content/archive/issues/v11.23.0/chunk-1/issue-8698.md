---
id: 8698
title: Update HomeCanvas JSDoc with Theming and Scaling architectures
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T05:51:26Z'
updatedAt: '2026-01-16T05:53:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8698'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T05:53:26Z'
---
# Update HomeCanvas JSDoc with Theming and Scaling architectures

The `apps/portal/canvas/HomeCanvas.mjs` class has recently undergone significant architectural updates:
1.  **Dynamic Theming:** Support for `light` and `dark` modes via a static `colors` palette.
2.  **Reference Viewport Scaling:** A resolution-independent rendering strategy using a dynamic `scale` factor based on a 1920x1080 baseline.

The current JSDoc, while detailed regarding the Zero-Allocation architecture, does not yet describe these new systems.

**Task:**
Update the class-level documentation to include:
-   **Theme System:** Explain how the `theme` config and `colors` map work.
-   **Responsive Strategy:** Document the "Reference Viewport" concept and how `scale` affects physics and rendering.
-   **Keywords:** Add semantic keywords to improve Knowledge Base discoverability (e.g., "responsive canvas", "canvas theming").

This aligns with the "Knowledge Base Enhancement Strategy" to ensure the code explains *why* it works the way it does.

## Timeline

- 2026-01-16T05:51:27Z @tobiu added the `documentation` label
- 2026-01-16T05:51:27Z @tobiu added the `ai` label
- 2026-01-16T05:52:11Z @tobiu referenced in commit `264f626` - "docs: Update HomeCanvas JSDoc with Theming and Scaling architectures (#8698)"
- 2026-01-16T05:52:19Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T05:52:41Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the class-level documentation for `HomeCanvas.mjs` to reflect the latest architectural enhancements.
> 
> **Updates:**
> 1.  **Responsive Architecture:** Added a section explaining the "Reference Viewport" strategy (baseline: 1920x1080) and how the `scale` factor normalizes physics and visuals across devices.
> 2.  **Theme System:** Added a section describing the `colors` palette and the hot-swapping capability via the `theme` config.
> 3.  **Keywords:** Enhanced the description with terms like "Reference Viewport", "Dynamic Scaling", and "Theme System" to improve knowledge base discoverability.
> 
> This ensures the documentation accurately describes *why* the canvas behaves as it does, fulfilling the Knowledge Base Enhancement Strategy.

- 2026-01-16T05:53:27Z @tobiu closed this issue

