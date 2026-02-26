---
id: 9313
title: 'Header Canvas: Fix layout syncing on mobile and dynamic item sizing'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-26T16:16:25Z'
updatedAt: '2026-02-26T19:29:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9313'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-26T19:29:59Z'
---
# Header Canvas: Fix layout syncing on mobile and dynamic item sizing

The header canvas currently relies heavily on the overall toolbar size to update its visual capture state. This leads to issues:

1.  **Mobile Orientation Change:** When using Chrome DevTools device mode, changing orientation does not correctly trigger a canvas update to recalculate the positions of the toolbar buttons.
2.  **Dynamic Item Loading (e.g., Logo):** If a child item (like the logo) loads asynchronously and changes its width/dimensions *without* changing the overall toolbar dimensions, the header canvas doesn't notice the layout shift, resulting in misaligned capture rectangles behind the buttons.

We need to analyze how we are observing the toolbar and its items to ensure the canvas correctly updates its 'holes' behind the buttons when internal sizes change.

## Timeline

- 2026-02-26T16:16:25Z @tobiu assigned to @tobiu
- 2026-02-26T16:16:26Z @tobiu added the `bug` label
- 2026-02-26T16:16:26Z @tobiu added the `ai` label
- 2026-02-26T19:29:11Z @tobiu referenced in commit `5119f60` - "Header Canvas: Fix layout syncing on mobile and dynamic item sizing (#9313)

- Replace debouncing with an async lock in `updateNavRects` to prevent worker bridge flooding during continuous resizing, ensuring the final layout frame is always captured. Added a 1s fallback timeout for safety.
- Combine the `getDomRect` calls for the buttons and the canvas itself into a single payload request, ensuring all coordinates come from the exact same layout frame.
- Allow subclassing `getObserverId` in `SharedCanvas` and override it in `header/Canvas` to observe the parent Toolbar. This correctly detects window resizes and orientation changes that shift flex items without triggering a canvas-level resize event.
- Add `resize` listeners to the toolbar buttons themselves to properly detect dynamic layout shifts (e.g., logo loading) that change child dimensions.
- Modify the payload to send canvas `width` and `height` alongside `rects`, and update `canvas/Header.mjs` to synchronously process both, ensuring the physics engine calculates collision geometry against the correct canvas dimensions."
### @tobiu - 2026-02-26T19:29:27Z

**Input from Gemini 3.1 Pro:**

> ✦ I have pushed the patch to `dev`. 
> This implementation replaces the broken debounce timeouts with a strict async queue lock, combines the `getDomRect` queries, adds `resize` listeners to the buttons themselves, and overrides `getObserverId` to observe the parent Toolbar. This ensures that dynamic layout shifts and rapid window resizing are handled smoothly without worker bridge flooding, while always capturing the final layout frame.
> 
> As discussed, the underlying event routing architecture in `SharedCanvas` is not ideal and requires a follow-up ticket. I am closing this ticket as the immediate regression is resolved.

- 2026-02-26T19:29:59Z @tobiu closed this issue
- 2026-02-26T19:31:25Z @tobiu cross-referenced by #9314

