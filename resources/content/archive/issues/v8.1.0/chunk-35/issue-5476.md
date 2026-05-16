---
id: 5476
title: 'Portal.view.home.parts.Colors: does not load the CSS file for Colors.view.Viewport'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2024-06-23T19:55:06Z'
updatedAt: '2024-06-23T20:17:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5476'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-23T20:17:36Z'
---
# Portal.view.home.parts.Colors: does not load the CSS file for Colors.view.Viewport

we need to look into: `worker.App: insertThemeFiles()`.

opening the colors app on its own loads the theme file.
opening the helix app inside the portal loads the related viewport file, only this one does not.

## Timeline

- 2024-06-23T19:55:06Z @tobiu added the `bug` label
- 2024-06-23T20:17:05Z @tobiu referenced in commit `100fb06` - "Portal.view.home.parts.Colors: does not load the CSS file for Colors.view.Viewport #5476"
### @tobiu - 2024-06-23T20:17:37Z

i think i fixed it, but it could use testing.

- 2024-06-23T20:17:37Z @tobiu closed this issue

