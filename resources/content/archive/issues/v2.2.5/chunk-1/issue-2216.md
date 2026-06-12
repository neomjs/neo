---
id: 2216
title: Inspect the event flickering while infinite scrolling inside the calendar week view
state: CLOSED
labels:
  - enhancement
  - help wanted
assignees: []
createdAt: '2021-05-31T10:38:38Z'
updatedAt: '2021-05-31T11:16:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2216'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-31T11:16:34Z'
---
# Inspect the event flickering while infinite scrolling inside the calendar week view

Video:
https://youtu.be/ugL4zh55FFw

My guess is that this is related to re-using the same dom ids for calendar events.
There could be browser caching in place, quickly moving previously used nodes from their last position to the new one.

## Timeline

- 2021-05-31T10:38:38Z @tobiu added the `enhancement` label
- 2021-05-31T10:38:46Z @tobiu added the `help wanted` label
### @tobiu - 2021-05-31T10:46:08Z

just tested it without specific event ids, still stays the same.

### @tobiu - 2021-05-31T11:12:42Z

the delta updates look fine as well: 28 deltas:
7 for adding new col headers, 7 for removing the old ones.
7 for adding new column bodies, 7 for removing the old ones.

### @tobiu - 2021-05-31T11:15:24Z

I think the main problem is, that we are rendering events and at the same point the column positions "jump" sidewards (infinite scrolling).

To resolve this, we can delay the event rendering into the next animation frame (a delay of 50ms is sufficient).

- 2021-05-31T11:16:06Z @tobiu referenced in commit `09f0ab8` - "Inspect the event flickering while infinite scrolling inside the calendar week view #2216"
- 2021-05-31T11:16:34Z @tobiu closed this issue

