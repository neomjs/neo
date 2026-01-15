---
id: 8665
title: Refactor HomeCanvas Styling & Pointer Events
state: CLOSED
labels:
  - design
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-15T01:19:26Z'
updatedAt: '2026-01-15T01:31:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8665'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T01:31:23Z'
---
# Refactor HomeCanvas Styling & Pointer Events

- Create `resources/scss/src/apps/portal/view/home/HomeCanvas.scss`.
- Move inline styles from `HomeCanvas.mjs` to the SCSS file.
- Add `pointer-events: none` to allow scrolling and clicking through the canvas.
- Remove inline `style` config from `HomeCanvas.mjs`.

## Timeline

- 2026-01-15T01:19:27Z @tobiu added the `design` label
- 2026-01-15T01:19:27Z @tobiu added the `refactoring` label
- 2026-01-15T01:25:56Z @tobiu assigned to @tobiu
- 2026-01-15T01:30:51Z @tobiu referenced in commit `726bd61` - "refactor: HomeCanvas SCSS and Parent-Delegated Interaction (#8665)"
### @tobiu - 2026-01-15T01:31:05Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored the HomeCanvas styling and interaction model.
> 
> **Changes:**
> 1.  **SCSS Architecture:** Moved inline styles to `resources/scss/src/apps/portal/home/HomeCanvas.scss`.
> 2.  **Pointer Events:** Added `pointer-events: none` to the canvas to ensure it doesn't block interactions with the "Get Started" buttons.
> 3.  **Interaction Model:** Since the canvas ignores mouse events, I moved the `mousemove` listener to the parent container (`MainNeo`).
>     - `MainNeo` now captures mouse moves and forwards them programmatically to `HomeCanvas.onMouseMove()`.
>     - This ensures the "Neural Galaxy" physics still react to the mouse (repulsion & parallax) without blocking UI clicks.
> 
> The implementation is now clean, themable, and functional.

- 2026-01-15T01:31:23Z @tobiu closed this issue
- 2026-01-15T01:31:53Z @tobiu added parent issue #8661

