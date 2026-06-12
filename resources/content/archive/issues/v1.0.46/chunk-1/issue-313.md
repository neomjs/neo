---
id: 313
title: 'form.field.Select: list keyNav broken'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2020-03-18T10:35:34Z'
updatedAt: '2020-03-18T13:45:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/313'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-18T13:45:41Z'
---
# form.field.Select: list keyNav broken

will look into it.

## Timeline

- 2020-03-18T10:35:34Z @tobiu added the `bug` label
- 2020-03-18T10:35:34Z @tobiu assigned to @tobiu
### @tobiu - 2020-03-18T12:59:27Z

related to the change that all dom events bubble up now.

in this case, the key down & up bubble from the list to the field, which should not happen.

- 2020-03-18T13:44:03Z @tobiu referenced in commit `f2cef8b` - "form.field.Select: list keyNav broken #313"
### @tobiu - 2020-03-18T13:45:41Z

util.KeyNavigation now uses the new "bubble" config => false for the keydown event.

- 2020-03-18T13:45:41Z @tobiu closed this issue

