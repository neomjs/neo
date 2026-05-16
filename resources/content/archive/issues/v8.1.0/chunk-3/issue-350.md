---
id: 350
title: 'form.field.Select: keydown arrowRight'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2020-03-20T09:16:06Z'
updatedAt: '2020-03-21T09:34:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/350'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-21T09:34:25Z'
---
# form.field.Select: keydown arrowRight

in case the typeAhead config is set, arrowRight should select the current preview value, in case there is one. did work before.

## Timeline

- 2020-03-20T09:16:06Z @tobiu added the `bug` label
- 2020-03-20T21:11:17Z @tobiu cross-referenced by #353
- 2020-03-21T09:32:15Z @tobiu referenced in commit `2295bcc` - "form.field.Select: keydown arrowRight #350"
### @tobiu - 2020-03-21T09:34:25Z

there only was a check if a keyProperty was on the model, not on the store (a store should grab the model one in case it does not have one, follow up ticket).

- 2020-03-21T09:34:25Z @tobiu closed this issue

