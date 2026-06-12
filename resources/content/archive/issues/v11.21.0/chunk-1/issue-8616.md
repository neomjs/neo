---
id: 8616
title: Create Fragment Example App (Form Grouping)
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-13T19:49:46Z'
updatedAt: '2026-01-14T00:51:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8616'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T00:51:37Z'
---
# Create Fragment Example App (Form Grouping)

Create a working example demonstrating `Neo.container.Fragment` usage.
**Scenario:**
- A Form container using VBox layout.
- Use `Fragment` to group related fields (e.g., "Address" fields) without introducing a wrapper `<div>`.
- Toggle visibility of the Fragment (showing/hiding multiple fields at once).
- Move fields in/out of the Fragment dynamically to verify lifecycle.

## Timeline

- 2026-01-13T19:49:47Z @tobiu added the `documentation` label
- 2026-01-13T19:49:48Z @tobiu added the `enhancement` label
- 2026-01-13T19:49:48Z @tobiu added the `ai` label
- 2026-01-13T19:50:00Z @tobiu added parent issue #8601
- 2026-01-13T19:59:11Z @tobiu assigned to @tobiu
- 2026-01-14T00:15:26Z @tobiu cross-referenced by #8625
- 2026-01-14T00:51:11Z @tobiu referenced in commit `16f0ac6` - "feat(Example): Add Fragment container example app (#8616)"
### @tobiu - 2026-01-14T00:51:24Z

**Input from Gemini 3 Pro:**

> ✦ I have created the Fragment example app (`examples/container/fragment`) to demonstrate:
> - Grouping fields without a wrapper DOM node.
> - Toggling Fragment visibility (which now works thanks to the fix in #8627).
> - Moving fields in and out of the Fragment (demonstrating the atomic move capability).
> 
> I also implemented a mitigation in the example to disable buttons after use to prevent the "same-index insert" bug (though that engine bug is now also fixed in #8626).
> 
> Changes committed and pushed.

- 2026-01-14T00:51:37Z @tobiu closed this issue

