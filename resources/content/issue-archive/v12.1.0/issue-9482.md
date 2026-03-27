---
id: 9482
title: 'Firefox Nightly: Scroll wheel stuck on Portal home page due to scroll-snap-type mandatory'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-15T19:20:36Z'
updatedAt: '2026-03-15T20:39:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9482'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-15T20:07:46Z'
---
# Firefox Nightly: Scroll wheel stuck on Portal home page due to scroll-snap-type mandatory

**Describe the bug**
On the portal app home route (`apps/portal/view/home/MainContainer.mjs`), we use a CSS-based "snappy" scrolling to enforce page-by-page scrolling (`scroll-snap-type: y mandatory`). 

This works fine in Chrome and Safari. However, in Firefox Nightly (v150), using the mouse wheel makes it virtually impossible to scroll down. The scroll increments from the wheel are too small to break the `mandatory` threshold for the 100vh sections, causing Firefox to snap back to the current element.

**To Reproduce**
1. Open the portal app in Firefox Nightly.
2. Go to the home route.
3. Try to scroll down using the mouse wheel.

**Expected behavior**
The user should be able to scroll to the next section using the mouse wheel.

**Solution**
We will apply a CSS feature query targeting Firefox to downgrade the snapping behavior to `proximity`. This allows free scrolling with the mouse wheel while still snapping when close to a boundary.

```css
@supports (-moz-appearance: none) {
    scroll-snap-type: y proximity;
}
```

## Timeline

- 2026-03-15T19:20:37Z @tobiu added the `bug` label
- 2026-03-15T19:20:38Z @tobiu added the `ai` label
- 2026-03-15T19:21:45Z @tobiu cross-referenced by #7372
- 2026-03-15T19:22:19Z @tobiu assigned to @tobiu
- 2026-03-15T20:06:52Z @tobiu referenced in commit `57a6558` - "style: Firefox Nightly scroll-snap fix for zero-width elements (#9482)"
### @tobiu - 2026-03-15T20:07:02Z

**Input from Gemini 3.1 Pro:**

> ✦ We successfully identified and resolved the root cause of the scroll wheel lock in Firefox Nightly.
> 
> **Diagnosis:**
> The issue was not the JavaScript events, the `OffscreenCanvas`, or the general CSS `scroll-snap-type` rules. 
> The culprit was the interaction between Firefox's layout engine, `scroll-snap-type: mandatory`, and a zero-width element using CSS scroll-driven animations (`animation-timeline: --page-scroll`).
> 
> The `.portal-home-progress` component, which is the first child in the DOM flow of the snapping container, used `scale: 0 1;` for its initial state. In Firefox, placing an element with an effective width of `0` at the very top of a scroll container while it evaluates a scroll intersection for a snap point triggers a calculation failure. It assumes the wheel delta is insufficient to break the `0` threshold, causing the viewport to snap immediately back to `scrollTop: 0`.
> 
> **Resolution:**
> The fix is surprisingly simple but highly specific. By changing the initial scale state from `scale: 0 1;` to `scale: 0.001 1;`, the element's bounding box is mathematically non-zero. This infinitesimally small value is completely invisible to the user but allows the Firefox layout engine to properly calculate the scroll intersections and release the snap lock when the user scrolls down from the Hero section.
> 
> A detailed comment has been added to the SCSS file to document this engine-specific hack for future reference.

- 2026-03-15T20:07:46Z @tobiu closed this issue
### @tobiu - 2026-03-15T20:39:42Z

opened a FF bugreport, to give the team a heads-up:
https://bugzilla.mozilla.org/show_bug.cgi?id=2023455


