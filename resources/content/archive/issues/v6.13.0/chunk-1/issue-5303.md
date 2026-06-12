---
id: 5303
title: 'form.field.Text: inputValue_ config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-03-07T11:34:51Z'
updatedAt: '2024-03-07T13:52:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5303'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-07T13:43:03Z'
---
# form.field.Text: inputValue_ config

We need a sharp separation of `inputValue` and `value`, especially for class extensions like `form.field.Select`.

The first step is to implement it inside the TextField base class and then create follow-up tickets for class extensions.

@ExtAnimal 

## Timeline

- 2024-03-07T11:34:51Z @tobiu added the `enhancement` label
- 2024-03-07T11:34:52Z @tobiu assigned to @tobiu
- 2024-03-07T11:36:32Z @tobiu referenced in commit `4f4fb84` - "form.field.Text: inputValue_ config #5303"
- 2024-03-07T11:38:46Z @tobiu referenced in commit `1a00391` - "#5303 form.field.Text: afterSetInputValue()"
- 2024-03-07T11:47:45Z @tobiu referenced in commit `fab4934` - "#5303 form.field.Text: onInputValueChange() => adjusted for the new config"
- 2024-03-07T12:04:33Z @tobiu referenced in commit `3567d25` - "#5303 form.field.Text: afterSetInputValue() => moved the DOM update from afterSetValue() here"
- 2024-03-07T13:31:05Z @tobiu referenced in commit `42569ea` - "#5303 form.field.Text: updateInputValueFromValue(), updateValueFromInputValue()"
- 2024-03-07T13:34:59Z @tobiu referenced in commit `ab5837c` - "#5303 form.field.Text: afterSetInputValue() => moved relevant css update logic from afterSetValue() here"
### @tobiu - 2024-03-07T13:43:04Z

the required changes are inside the TextField class now. before adjusting DateField, NumberField and SelectField, we need to write component tests for this class first: https://github.com/neomjs/neo/issues/5140

- 2024-03-07T13:43:04Z @tobiu closed this issue
- 2024-03-26T16:29:40Z @tobiu referenced in commit `7b73bcc` - "form.field.Text: inputValue_ config #5303"
- 2024-03-26T16:29:40Z @tobiu referenced in commit `c494639` - "#5303 form.field.Text: afterSetInputValue()"
- 2024-03-26T16:29:40Z @tobiu referenced in commit `9bd7bd2` - "#5303 form.field.Text: onInputValueChange() => adjusted for the new config"
- 2024-03-26T16:29:40Z @tobiu referenced in commit `ccace6f` - "#5303 form.field.Text: afterSetInputValue() => moved the DOM update from afterSetValue() here"
- 2024-03-26T16:29:40Z @tobiu referenced in commit `732b2bc` - "#5303 form.field.Text: updateInputValueFromValue(), updateValueFromInputValue()"
- 2024-03-26T16:29:40Z @tobiu referenced in commit `574b7c2` - "#5303 form.field.Text: afterSetInputValue() => moved relevant css update logic from afterSetValue() here"

