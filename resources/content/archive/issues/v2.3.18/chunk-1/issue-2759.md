---
id: 2759
title: 'form.field.Select: onKeyDownRight() broken'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2021-11-30T21:40:06Z'
updatedAt: '2021-11-30T21:46:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2759'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-11-30T21:46:54Z'
---
# form.field.Select: onKeyDownRight() broken

this is related to an internal change, where the control was storing the selected record inside the `value` config.

I will revert this change and adjust the `change` event to also pass the new record.

It might be better to make the record config observable:
`record` => `record_`

and fire an own `recordChange` event, but this would be a follow up ticket.

## Timeline

- 2021-11-30T21:40:06Z @tobiu added the `bug` label
- 2021-11-30T21:40:56Z @tobiu referenced in commit `22602c1` - "form.field.Select: onKeyDownRight() broken #2759"
- 2021-11-30T21:46:54Z @tobiu closed this issue

