---
id: 8592
title: Fix TreeList scrolling artifacts and header styling
state: OPEN
labels:
  - bug
  - ai
assignees: []
createdAt: '2026-01-13T11:22:42Z'
updatedAt: '2026-01-13T11:22:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8592'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fix TreeList scrolling artifacts and header styling

When using deep linking (e.g. `#/news/tickets/7112`) with the new `expandAndScrollToItem` logic, several issues occur:

1.  **Horizontal Scrolling:** Scrolling an item into view can cause the list to scroll horizontally if the item content is wider than the container, potentially pushing other items or the header out of view.
2.  **Broken Header Styling:** The sticky header text is not bold, which is a regression.
3.  **Sticky Header Behavior:** When `scrollIntoView` centers an item, the sticky header might not "stick" correctly or appear in the correct "stuck" state if the scroll position is in the middle of a section.

**Steps to Reproduce:**
1.  Navigate to `apps/portal/`
2.  Use a route like `#/news/tickets/7112`
3.  Observe the tree list behavior and styling.

## Timeline

- 2026-01-13T11:22:43Z @tobiu added the `bug` label
- 2026-01-13T11:22:43Z @tobiu added the `ai` label

