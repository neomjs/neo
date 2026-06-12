---
id: 5728
title: 'worker.App: onOrientationChange() => limit the scope to affected windows'
state: OPEN
labels:
  - enhancement
  - no auto close
assignees:
  - Dinkh
createdAt: '2024-08-09T10:04:15Z'
updatedAt: '2026-05-16T20:50:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5728'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# worker.App: onOrientationChange() => limit the scope to affected windows

@Dinkh: adding an `orientationchange` notification for apps is a good idea in general.

however, the multi-window aspect probably should get honored.

tricky one: we could argue that the event can only happen on mobile where all windows are affected anyway.

edge-case: desktop, where you debug a specific window in the mobile view and switch the orientation there. in this case, other windows are not affected.

low prio.

## Timeline

- 2024-08-09T10:04:15Z @tobiu added the `enhancement` label
- 2024-08-09T10:04:16Z @tobiu assigned to @Dinkh
### @Dinkh - 2024-08-10T16:09:23Z

@tobiu In fact this will only affect Desktop. And for desktop it seems more likely to use responsive settings than orientationchange.

For Tablets and Phone this should not matter, as you cannot have resizable windows.

I would argue, that this issue should be closed.

- 2024-10-07T21:52:46Z @tobiu added the `no auto close` label

