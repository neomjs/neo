---
id: 1601
title: 'form.field.Text: afterSetValue() => change event'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-27T16:04:04Z'
updatedAt: '2021-03-27T16:07:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1601'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-27T16:07:11Z'
---
# form.field.Text: afterSetValue() => change event

it is important to fire the change event (parent call) at the end of this method.

otherwise redundant delta updates can happen.

## Timeline

- 2021-03-27T16:04:04Z @tobiu added the `enhancement` label
- 2021-03-27T16:04:04Z @tobiu assigned to @tobiu
- 2021-03-27T16:04:25Z @tobiu referenced in commit `a71dd19` - "form.field.Text: afterSetValue() => change event #1601"
- 2021-03-27T16:07:11Z @tobiu closed this issue

