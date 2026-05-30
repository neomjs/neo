---
id: 3537
title: 'form.field.Text: hideLabel & labelPosition: ''inline'''
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-10-13T11:40:25Z'
updatedAt: '2022-10-13T13:27:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3537'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-10-13T13:27:10Z'
---
# form.field.Text: hideLabel & labelPosition: 'inline'

Right now, it looks like the `hideLabel: true` config removes the field border completely.

For `labelPosition: 'inline'`, only the text inside the label wrapper should get removed.

## Timeline

- 2022-10-13T11:40:25Z @tobiu added the `bug` label
- 2022-10-13T11:40:25Z @tobiu assigned to @tobiu
- 2022-10-13T13:23:23Z @tobiu referenced in commit `4925d7f` - "form.field.Text: hideLabel & labelPosition: 'inline' #3537"
- 2022-10-13T13:25:43Z @tobiu referenced in commit `13a64fd` - "#3537 adjusted afterSetLabelPosition()"
### @tobiu - 2022-10-13T13:27:10Z

<img width="650" alt="Screenshot 2022-10-13 at 15 26 50" src="https://user-images.githubusercontent.com/1177434/195609444-b3139c72-2e97-45bc-b68a-f8f03b020273.png">


- 2022-10-13T13:27:10Z @tobiu closed this issue

