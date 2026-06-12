---
id: 5900
title: 'main.DomEvents: onClick() => limit the message to app to the event.detail property => < 2'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-13T16:39:30Z'
updatedAt: '2024-09-15T14:23:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5900'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T14:23:28Z'
---
# main.DomEvents: onClick() => limit the message to app to the event.detail property => < 2

*(No description provided)*

## Timeline

- 2024-09-13T16:39:31Z @tobiu added the `enhancement` label
- 2024-09-13T16:39:31Z @tobiu assigned to @tobiu
- 2024-09-13T16:39:45Z @tobiu referenced in commit `7de976e` - "main.DomEvents: onClick() => limit the message to app to the event.detail property => < 2 #5900"
- 2024-09-13T16:39:55Z @tobiu closed this issue
### @tobiu - 2024-09-13T16:51:47Z

this is obviously assuming that we want `onClick()` to act like `onSingleClick()`.

### @tobiu - 2024-09-15T14:22:44Z

thinking more about this one:
in case a new dev wants to create a button click counter increase logic, clicks would get significantly slowed down for no reason, giving a bad performance impression.

so, main should forward all click events, but add the detail (click count) info to the app worker, so that we can work with it there.

- 2024-09-15T14:22:44Z @tobiu reopened this issue
- 2024-09-15T14:23:23Z @tobiu referenced in commit `889acab` - "#5900 main.DomEvents: onClick() => passing the detail property to app"
- 2024-09-15T14:23:28Z @tobiu closed this issue

