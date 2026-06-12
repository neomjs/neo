---
id: 2305
title: 'form.field.Text: labelPosition: inline => the top center border does no longer get updated (width)'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-06-07T00:57:48Z'
updatedAt: '2021-06-07T07:17:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2305'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-07T07:17:47Z'
---
# form.field.Text: labelPosition: inline => the top center border does no longer get updated (width)

*(No description provided)*

## Timeline

- 2021-06-07T00:57:48Z @tobiu added the `bug` label
- 2021-06-07T00:57:49Z @tobiu assigned to @tobiu
- 2021-06-07T07:16:52Z @tobiu referenced in commit `853ba01` - "form.field.Text: labelPosition: inline => the top center border does no longer get updated (width) #2305"
### @tobiu - 2021-06-07T07:17:47Z

this was an edge case inside the calendar edit week form.

the update did happen, but it shrinked each time, since it was based on a vdom width.

- 2021-06-07T07:17:47Z @tobiu closed this issue

