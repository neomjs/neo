---
id: 9312
title: 'DevIndex: Disable controls toggle button on learn route'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-26T16:04:45Z'
updatedAt: '2026-02-26T16:09:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9312'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-26T16:09:41Z'
---
# DevIndex: Disable controls toggle button on learn route

When starting DevIndex directly on the `/learn` route, clicking the 'hamburger' controls toggle button causes a JS error because the home view (where the controls and grid are) is not yet mounted due to lazy loading.

    If navigating from home to learn, the click is pointless as the controls are not visible.

    The solution is to toggle the `disabled` state of the `controls-toggle-button` inside the viewport's route handler methods (`onHomeRoute` and `onLearnRoute`).

## Timeline

- 2026-02-26T16:04:45Z @tobiu assigned to @tobiu
- 2026-02-26T16:04:46Z @tobiu added the `bug` label
- 2026-02-26T16:04:47Z @tobiu added the `ai` label
- 2026-02-26T16:07:48Z @tobiu referenced in commit `2b3e98a` - "DevIndex: Disable controls toggle button on learn route (#9312)"
### @tobiu - 2026-02-26T16:09:19Z

**Input from Gemini 3.1 Pro:**

> ✦ The `controls-toggle-button` is now explicitly disabled on the `/learn` route and enabled on the `/home` route. This resolves the JS error caused by clicking it when the home view is not mounted. The change is committed and pushed to `dev`.

- 2026-02-26T16:09:42Z @tobiu closed this issue

