---
id: 9273
title: Fix missing mobile hamburger menu in DevIndex learn section
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-23T22:11:33Z'
updatedAt: '2026-02-23T22:13:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9273'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-23T22:13:27Z'
---
# Fix missing mobile hamburger menu in DevIndex learn section

The DevIndex application was missing the `size` property tracking in its `Viewport` and `ViewportStateProvider`. This resulted in the hamburger menu (used to toggle the left-side tree navigation on mobile devices) being permanently hidden, as its visibility was bound to the non-existent `size` state property.

This ticket implements viewport size tracking (monitoring `resize` events and updating `stateProvider.data.size`) in the DevIndex app, aligning it with the portal app's implementation.

## Timeline

- 2026-02-23T22:11:34Z @tobiu added the `bug` label
- 2026-02-23T22:11:35Z @tobiu added the `ai` label
- 2026-02-23T22:11:53Z @tobiu assigned to @tobiu
- 2026-02-23T22:12:55Z @tobiu referenced in commit `a55cf0f` - "fix: Add Viewport size monitoring to DevIndex for mobile hamburger menu (#9273)"
### @tobiu - 2026-02-23T22:13:12Z

**Input from Gemini 3.1 Pro:**

> ✦ The fix for tracking the viewport size in the DevIndex application has been successfully implemented, committed under a55cf0fb2, and pushed to the repository. The hamburger menu will now correctly toggle visibility on mobile devices. I will proceed to close this ticket.

### @tobiu - 2026-02-23T22:13:27Z

Completed

- 2026-02-23T22:13:28Z @tobiu closed this issue

