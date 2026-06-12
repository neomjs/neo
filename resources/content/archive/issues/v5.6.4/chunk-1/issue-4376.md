---
id: 4376
title: component.DatePicker => support for ancient dates like a year of 200
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-05-03T11:40:28Z'
updatedAt: '2023-05-03T11:41:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4376'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-03T11:41:19Z'
---
# component.DatePicker => support for ancient dates like a year of 200

in case you use `form.field.Date` and type in 01 01 0200, then open the picker and click on a different day, we get a max callstack error with dates iterating back and forth.

## Timeline

- 2023-05-03T11:40:28Z @tobiu added the `bug` label
- 2023-05-03T11:40:29Z @tobiu assigned to @tobiu
- 2023-05-03T11:41:09Z @tobiu referenced in commit `bb0fdc0` - "component.DatePicker => support for ancient dates like a year of 200 #4376"
- 2023-05-03T11:41:19Z @tobiu closed this issue
- 2023-05-03T11:42:12Z @tobiu cross-referenced by #4377

