---
id: 3325
title: 'form.field.Text: dynamically adding errors'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-07-29T11:15:29Z'
updatedAt: '2022-07-29T12:57:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3325'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-29T12:57:17Z'
---
# form.field.Text: dynamically adding errors

This feature is important for `server-side validations`. E.g. a form where field values are getting checked VS BE-rules.

This feature feels like an epic, since it requires multiple changes.

1. `isValid()` needs to check if there is an `errorText` (or error) in place.
2. changing `errorText` needs to update the UI.
3. we need a new `validate` method which checks for client side errors (on value change)

## Timeline

- 2022-07-29T11:15:29Z @tobiu added the `enhancement` label
- 2022-07-29T11:15:29Z @tobiu assigned to @tobiu
- 2022-07-29T11:18:25Z @tobiu referenced in commit `12ed441` - "#3325 field.Base: validate()"
- 2022-07-29T11:23:39Z @tobiu referenced in commit `dd309e6` - "#3325 form.field.Text: validate(), adjusted isValid()"
- 2022-07-29T11:34:08Z @tobiu referenced in commit `40aa405` - "#3325 form.field.Text: replaced updateValidationIndicators()"
- 2022-07-29T11:38:42Z @tobiu referenced in commit `c51fbb6` - "#3325 form.field.Text: updateError()"
- 2022-07-29T11:55:29Z @tobiu referenced in commit `6b25989` - "#3325 form.field.Text: updateError() silent param, validate() => silent param"
- 2022-07-29T11:58:01Z @tobiu referenced in commit `04abdbb` - "#3325 form.field.Number: afterSetMaxValue(), afterSetMinValue() adjustment"
- 2022-07-29T12:31:00Z @tobiu referenced in commit `db14bd4` - "#3325 form.field.Text: validate() => logic enhancements"
- 2022-07-29T12:52:41Z @tobiu referenced in commit `e60403e` - "#3325 examples.form.field.text.MainContainer: error TextField"
- 2022-07-29T12:57:08Z @tobiu referenced in commit `4fabbae` - "#3325 examples.form.field.text.MainContainer: clearing the new error field in case we change the field value"
- 2022-07-29T12:57:17Z @tobiu closed this issue

