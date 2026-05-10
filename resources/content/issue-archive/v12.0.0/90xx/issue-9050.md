---
id: 9050
title: 'Perf: Optimize DomAccess.syncAligns to avoid scroll thrashing'
state: CLOSED
labels:
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-08T16:27:47Z'
updatedAt: '2026-02-08T16:29:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9050'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T16:29:38Z'
---
# Perf: Optimize DomAccess.syncAligns to avoid scroll thrashing

`Neo.main.DomAccess.syncAligns` triggers a full realignment cycle on every scroll event. This can cause significant layout thrashing (performance "hammering"), especially when scrolling inside a floating container (like a Picker's list) that is itself aligned to another element.

**Goal:**
Optimize `syncAligns` to filter scroll events. It should only trigger re-alignment if the scrolling element is an ancestor of the alignment target or the constraint element. If the scroll event originates from within the aligned component itself (or an unrelated container), the alignment logic should be skipped.

**Implementation Plan:**
1.  Modify `syncAligns` in `src/main/DomAccess.mjs`.
2.  Check if the event type is `scroll`.
3.  If it is, verify if the `event.target` contains the `align.targetElement` or `align.constrainToElement`.
4.  If neither is contained, return early and skip `align()`.

This will prevent unnecessary calculations and DOM read/writes during scrolling interactions within floating components.

## Timeline

- 2026-02-08T16:27:48Z @tobiu added the `ai` label
- 2026-02-08T16:27:48Z @tobiu added the `performance` label
- 2026-02-08T16:27:48Z @tobiu added the `core` label
- 2026-02-08T16:28:55Z @tobiu referenced in commit `d79dbae` - "perf: Optimize DomAccess.syncAligns to avoid scroll thrashing (#9050)"
### @tobiu - 2026-02-08T16:29:08Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the optimization in `src/main/DomAccess.mjs`.
> 
> The `syncAligns` method now checks if the event type is `scroll`. If it is, and the target is not the document/window, it verifies if the scroll target contains either the `align.targetElement` or the `align.constrainToElement`.
> 
> If the scroll target is unrelated (e.g., scrolling inside the picker's own content), the re-alignment logic is skipped. This effectively stops the layout thrashing loop.
> 
> Merged in commit `d79dbae23`.

- 2026-02-08T16:29:22Z @tobiu assigned to @tobiu
- 2026-02-08T16:29:38Z @tobiu closed this issue

