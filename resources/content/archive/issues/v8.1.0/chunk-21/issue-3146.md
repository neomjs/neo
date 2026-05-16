---
id: 3146
title: Drag&drop broken inside chrome for windows
state: CLOSED
labels:
  - bug
  - help wanted
assignees: []
createdAt: '2022-06-12T17:10:29Z'
updatedAt: '2022-07-12T12:05:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3146'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-12T12:05:30Z'
---
# Drag&drop broken inside chrome for windows

we encountered this on @davhm laptop recently. it affects moving and resizing dialogs as well as calendar events.

it would be nice if another windows-user could double-check this to ensure it is not just a local setting causing trouble (on windows on my machine).

a bit weird for sure that chrome acts differently on MacOS.

## Timeline

- 2022-06-12T17:10:29Z @tobiu added the `bug` label
- 2022-06-12T17:10:29Z @tobiu added the `help wanted` label
- 2022-06-12T17:15:29Z @tobiu changed title from **Drag&drop broken in chrome and windows** to **Drag&drop broken inside chrome for windows**
### @davhm - 2022-07-12T11:11:54Z

This seems to have been a one-off, since drag & drop is working fine again (I've just tested it). Probably caused by some broken state being loaded.

I vote for closing.

### @tobiu - 2022-07-12T12:05:29Z

closing sounds good. it might have been related to: https://github.com/neomjs/neo/issues/3267

- 2022-07-12T12:05:30Z @tobiu closed this issue

