---
id: 1124
title: 'form.field.Text: triggers are behind the visible area in FF'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2020-08-22T10:54:30Z'
updatedAt: '2020-08-22T11:23:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1124'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-22T11:23:19Z'
---
# form.field.Text: triggers are behind the visible area in FF

need to take a closer look into this.

![Screenshot 2020-08-22 at 12 52 03](https://user-images.githubusercontent.com/1177434/90954676-9a0c6980-e476-11ea-8e60-448da5ecb2bf.png)


## Timeline

- 2020-08-22T10:54:31Z @tobiu added the `bug` label
### @tobiu - 2020-08-22T11:14:51Z

firefox does not really work with flex basis.
`flex: 1 1 30px`
or
`flex: 1 1 100%`

pushes the triggers out of the visible area.

`flex-grow: 1; flex-shrink: 1;`

seems to work. needs testing for side effects (e.g. in chrome).


- 2020-08-22T11:22:02Z @tobiu referenced in commit `ef60dc7` - "form.field.Text: triggers are behind the visible area in FF #1124"
- 2020-08-22T11:23:19Z @tobiu closed this issue

