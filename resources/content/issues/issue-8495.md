---
id: 8495
title: Fix sticky folder visual regression in transparent TreeList navigation
state: CLOSED
labels:
  - bug
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T10:07:29Z'
updatedAt: '2026-01-10T13:52:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8495'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T13:52:56Z'
---
# Fix sticky folder visual regression in transparent TreeList navigation

Recent design changes made `TreeList` items transparent to reveal the app background. This caused a regression for `position: sticky` folder headers.

**Problem:**
Previously, opaque headers obscured scrolling content when stuck. Now, transparent headers cause text overlap (sticky header text + scrolling content text underneath) as the user scrolls.

**Goal:**
Restore visual separation for sticky headers while maintaining the transparent aesthetic when they are *not* stuck.

**Challenge:**
Detect when a sticky element is actively "stuck" to apply a conditional background (e.g., a blur, gradient, or opaque color). Standard CSS does not currently provide a `:stuck` pseudo-class.

**Potential Approaches to Explore:**
- `backdrop-filter: blur()` (simplest, but support varies and might not provide enough contrast).
- `IntersectionObserver` "sentinel" pattern (placing a hidden element above the sticky target to detect when it hits the top).
- Javascript scroll monitoring (needs to be performant).

**Impact:**
Affects the navigation trees in the **Learning** and **Releases** sections of the Portal.

## Timeline

- 2026-01-10T10:07:30Z @tobiu added the `bug` label
- 2026-01-10T10:07:30Z @tobiu added the `design` label
- 2026-01-10T10:07:30Z @tobiu added the `ai` label
- 2026-01-10T13:33:37Z @tobiu assigned to @tobiu
- 2026-01-10T13:52:19Z @tobiu referenced in commit `dec9690` - "feat: Implement sticky folder visual state for TreeList (#8495)

- Add saveScrollPosition config to Neo.tree.List (default false)
- Implement onScrollCapture to detect sticky state for folders
- Enable saveScrollPosition in Portal TreeList
- Add .neo-stuck CSS style for transparent TreeList navigation"
### @tobiu - 2026-01-10T13:52:28Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the visual fix for sticky folders in the TreeList.
> 
> **Changes:**
> 1.  **Framework Core (`Neo.tree.List`):**
>     *   Added `saveScrollPosition: false` (default) to `static config`.
>     *   Implemented `onScrollCapture` to calculate sticky state logic. It toggles the `neo-stuck` class on folder nodes when `scrollTop > 0` and the scroll position overlaps with the sticky header's `top` position.
> 2.  **Portal App (`Portal.view.shared.content.TreeList`):**
>     *   Enabled `saveScrollPosition: true` to opt-in to the new behavior.
> 3.  **Theming (`TreeList.scss`):**
>     *   Added `.neo-stuck` rule to apply `background-color: var(--list-item-background-color)`.
> 
> This restores the visual separation for sticky headers while maintaining transparency when they are not stuck.

- 2026-01-10T13:52:56Z @tobiu closed this issue

