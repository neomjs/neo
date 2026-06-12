---
id: 4322
title: 'form.field.Number: When empty input, field should show required error message (Validation)'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-04-26T12:38:54Z'
updatedAt: '2023-04-26T14:29:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4322'
author: alberthashani
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-04-26T14:29:36Z'
---
# form.field.Number: When empty input, field should show required error message (Validation)

![image](https://user-images.githubusercontent.com/9343751/234576495-9bebd7cc-e120-4639-aa95-49b4f3b4a572.png)

Currently, with an empty input step size error message is shown -> "step-size violation: NaN / 1"

Config
`{
            module   : NumberField,
            required : true,
            minLength: 0,
            maxLength: 10,
            clearable: false
        }`

## Timeline

- 2023-04-26T12:38:54Z @alberthashani added the `bug` label
- 2023-04-26T14:29:25Z @tobiu referenced in commit `31a3840` - "form.field.Number: When empty input, field should show required error message (Validation) #4322"
- 2023-04-26T14:29:37Z @tobiu closed this issue

