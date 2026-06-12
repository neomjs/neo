---
id: 8464
title: Fix Blog List Rendering Artifact in Release View
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2026-01-09T12:42:46Z'
updatedAt: '2026-01-09T13:50:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8464'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T13:13:19Z'
---
# Fix Blog List Rendering Artifact in Release View

A rendering artifact has been observed in the Portal App where the Blog (News) List occasionally renders inside the Release Notes view, specifically taking over the `Splitter` component's DOM node.

**Symptoms:**
- The `Splitter` in `Portal.view.news.release.MainContainer` (`neo-splitter-1`) acquires the class names of the Blog List Wrapper (`portal-blog-list-wrapper`).
- The `Splitter` contains the Blog List (`neo-list-2`) as a child node in the VDOM/VNode tree.
- This occurs during navigation between the News (Blog) and Release Notes tabs.

**Theory (Potential Race Condition):**
This may be caused by a race condition rather than a direct VDOM diffing error.
1. The News (Blog) List initiates a large content update or roundtrip.
2. The user switches the tab to Release Notes before the update completes.
3. The pending update arrives and targets the same parent index (Item 1), which is now occupied by the `Splitter` in the new view.
4. The VDOM engine applies the update to the current occupant of that index, resulting in the "zombie" node state.

**Fix:**
We will enforce VDOM node distinction by adding unique `key` properties to:
1. The `Splitter` in `apps/portal/view/shared/content/Container.mjs`.
2. The `List` in `apps/portal/view/news/blog/Container.mjs`.

This will force the VDOM engine to treat these as distinct nodes, tearing down the old one and creating the new one, regardless of timing or index collisions.

## Timeline

- 2026-01-09T12:42:47Z @tobiu added the `bug` label
- 2026-01-09T13:12:30Z @tobiu referenced in commit `c454339` - "fix: Blog List Rendering Artifact in Release View (#8464)"
- 2026-01-09T13:12:52Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T13:12:58Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix by enforcing unique, deterministic VDOM IDs for the conflicting components (`Splitter` and `Blog List`). This ensures the VDOM engine treats them as distinct nodes during view switching, preventing the race condition where one view's update "zombies" into the other.
> 
> **Implementation Detail:**
> Used `onConstructed` to dynamically set IDs based on the parent container's ID (`${me.id}__splitter` / `${me.id}__list`). This avoids modifying the class `construct` logic and preserves extensibility.
> 
> **Note:**
> While this fixes the immediate artifact, the fact that manual IDs were required suggests a deeper issue in how the VDOM engine handles auto-generated ID syncing during rapid state transitions (race conditions). This should be investigated further in a separate initiative.
> 
> Commit: c4543396d (#8464)

- 2026-01-09T13:13:19Z @tobiu closed this issue
- 2026-01-09T13:32:00Z @tobiu cross-referenced by #8465
### @tobiu - 2026-01-09T13:50:30Z

**Input from Gemini 3 Pro:**

> ✦ ✦ Follow-up: The permanent architectural fix for this issue has been implemented and verified in #8465. The manual ID assignments previously added to the Portal app have been removed as they are no longer necessary.


