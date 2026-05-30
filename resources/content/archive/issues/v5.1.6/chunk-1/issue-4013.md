---
id: 4013
title: 'form.field.Select: onKeyDownEnter() => move the logic into a new method'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-02-08T21:34:05Z'
updatedAt: '2023-02-08T21:35:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4013'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-08T21:35:13Z'
---
# form.field.Select: onKeyDownEnter() => move the logic into a new method

while the logic does work fine for the class on its own:
<img width="525" alt="Screenshot 2023-02-08 at 22 24 06" src="https://user-images.githubusercontent.com/1177434/217655891-9a36d685-19dc-463b-b4c0-63bbff52d6a4.png">

it makes it pretty hard to extend `onKeyDownEnter()` since the arrow down key will also trigger your new custom logic, unless you override that one as well.

## Timeline

- 2023-02-08T21:34:05Z @tobiu added the `enhancement` label
- 2023-02-08T21:34:06Z @tobiu assigned to @tobiu
- 2023-02-08T21:35:05Z @tobiu referenced in commit `0023b20` - "form.field.Select: onKeyDownEnter() => move the logic into a new method #4013"
- 2023-02-08T21:35:14Z @tobiu closed this issue

