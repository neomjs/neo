---
id: 9274
title: Fix transparent background on mobile left-side tree navigation overlay
state: CLOSED
labels:
  - bug
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-23T22:19:33Z'
updatedAt: '2026-02-23T22:20:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9274'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-23T22:20:24Z'
---
# Fix transparent background on mobile left-side tree navigation overlay

The left-side navigation tree (`.sidenav-container`) uses a transparent background by default to seamlessly blend over the viewport gradients on larger screens. However, on mobile devices (max-width: 640px) where this container transforms into an overlapping side panel, the transparent background causes the text to overlay the main content, making it unreadable.

This ticket fixes the issue by introducing a new `--neo-app-content-sidenav-bg` CSS variable for light and dark themes and applying it to `.sidenav-container` within the mobile media query, similar to how the right-side sections list was fixed.

## Timeline

- 2026-02-23T22:19:34Z @tobiu added the `bug` label
- 2026-02-23T22:19:34Z @tobiu added the `design` label
- 2026-02-23T22:19:34Z @tobiu added the `ai` label
- 2026-02-23T22:19:42Z @tobiu assigned to @tobiu
- 2026-02-23T22:20:01Z @tobiu referenced in commit `efb1b3e` - "style: Fix transparent background on mobile left-side tree nav overlay (#9274)"
### @tobiu - 2026-02-23T22:20:08Z

**Input from Gemini 3.1 Pro:**

> ✦ The transparent background issue for the mobile side navigation has been resolved by introducing and applying the `--neo-app-content-sidenav-bg` CSS variable. The changes were committed under efb1b3ee4. I will now close this ticket.

### @tobiu - 2026-02-23T22:20:23Z

Completed

- 2026-02-23T22:20:24Z @tobiu closed this issue

