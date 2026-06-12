---
id: 5755
title: 'main.DomEvents: onKeyDown() => only prevent arrow keys from scrolling for views with a selection model'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-08-13T20:08:30Z'
updatedAt: '2024-08-13T20:09:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5755'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-13T20:09:01Z'
---
# main.DomEvents: onKeyDown() => only prevent arrow keys from scrolling for views with a selection model

i just got noticed on reddit about this one:
https://www.reddit.com/r/javascript/comments/1er102o/comment/lhyje9x/

this is related to an old ticket: https://github.com/neomjs/neo/issues/1729

the logic should be that arrow keys prevent their default for views which are using a selection model.
especially the table is critical.


## Timeline

- 2024-08-13T20:08:31Z @tobiu added the `bug` label
- 2024-08-13T20:08:31Z @tobiu assigned to @tobiu
- 2024-08-13T20:08:59Z @tobiu referenced in commit `a08e842` - "main.DomEvents: onKeyDown() => only prevent arrow keys from scrolling for views with a selection model #5755"
- 2024-08-13T20:09:01Z @tobiu closed this issue

