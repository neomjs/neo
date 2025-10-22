---
id: 7044
title: 'examples.todoList.version1.MainComponent: vtype: "text" gets rendered as a div'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-07-13T17:22:01Z'
updatedAt: '2025-07-13T17:29:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7044'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-13T17:29:48Z'
---
# examples.todoList.version1.MainComponent: vtype: "text" gets rendered as a div

**Reported by:** @tobiu on 2025-07-13

Regression issue, this worked fine with the string based mount adapter.

<img width="976" height="732" alt="Image" src="https://github.com/user-attachments/assets/9c3cce44-30ee-44f6-bbc2-037a525e7cd7" />

Most likely, one of these 2 files is responsible:

* `Neo.main.render.DomApiRenderer`
* `Neo.main.DeltaUpdates`

## Comments

### @tobiu - 2025-07-13 17:29

<img width="988" height="749" alt="Image" src="https://github.com/user-attachments/assets/fae2ae64-0562-4682-a248-e4c2b2100694" />

