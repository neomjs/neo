---
id: 4724
title: 'form.field.Switch: styling doesn''t apply'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-08-15T14:57:37Z'
updatedAt: '2023-08-15T15:33:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4724'
author: pensuwan-k
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-15T15:33:07Z'
---
# form.field.Switch: styling doesn't apply

the base class in form.field.Switch does not match with the class in scss file

## Timeline

- 2023-08-15T14:57:37Z @pensuwan-k added the `bug` label
### @tobiu - 2023-08-15T15:03:27Z

do you want to add a PR? should be just the missing `neo-` inside the scss file.

i will create a new ticket for the missing example app.

tagging torsten @Dinkh 

- 2023-08-15T15:17:04Z @tobiu referenced in commit `37bd7dd` - "Merge pull request #4726 from dztoprak/fix/switch-styling

#4724 Fix/switch styling"
### @tobiu - 2023-08-15T15:19:34Z

<img width="744" alt="Screenshot 2023-08-15 at 17 18 58" src="https://github.com/neomjs/neo/assets/1177434/d7d7b88a-18ed-4598-8ec5-62d211959cf0">

looks pretty much the same in both themes

- 2023-08-15T15:22:10Z @tobiu referenced in commit `32cf688` - "#4724 theme files formatting"
- 2023-08-15T15:23:25Z @tobiu referenced in commit `970e44d` - "#4724 theme files: sorting vars"
- 2023-08-15T15:32:58Z @tobiu referenced in commit `fc19174` - "#4724 scss src cleanup"
- 2023-08-15T15:33:07Z @tobiu closed this issue

