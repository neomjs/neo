---
id: 8495
title: Fix sticky folder visual regression in transparent TreeList navigation
state: OPEN
labels:
  - bug
  - design
  - ai
assignees: []
createdAt: '2026-01-10T10:07:29Z'
updatedAt: '2026-01-10T10:07:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8495'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

## Activity Log

- 2026-01-10 @tobiu added the `bug` label
- 2026-01-10 @tobiu added the `design` label
- 2026-01-10 @tobiu added the `ai` label

