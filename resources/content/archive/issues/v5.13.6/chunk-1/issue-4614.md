---
id: 4614
title: 'form.Container: adjustTreeLeaves() breaks when setting the value for SelectFields'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-08-02T10:53:26Z'
updatedAt: '2023-08-02T14:42:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4614'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-02T14:42:06Z'
---
# form.Container: adjustTreeLeaves() breaks when setting the value for SelectFields

regression issue, after introducing `setConfigs()` which now gets used by `setValues()`.

<img width="775" alt="Screenshot 2023-08-02 at 12 53 13" src="https://github.com/neomjs/neo/assets/1177434/e7d3fd25-44b7-4822-98ae-467f0849dea8">


## Timeline

- 2023-08-02T10:53:26Z @tobiu added the `bug` label
- 2023-08-02T14:41:30Z @tobiu referenced in commit `ce3e89e` - "form.Container: adjustTreeLeaves() breaks when setting the value for SelectFields #4614"
### @tobiu - 2023-08-02T14:42:06Z

apps/form is fully functional again. the changes require more testing though.

- 2023-08-02T14:42:06Z @tobiu closed this issue

