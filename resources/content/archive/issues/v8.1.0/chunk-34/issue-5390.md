---
id: 5390
title: 'form.field.ComboBox: does not hide the picker in case editable is false and opening it via a trigger click'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-04-12T10:57:04Z'
updatedAt: '2024-04-12T10:57:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5390'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-04-12T10:57:46Z'
---
# form.field.ComboBox: does not hide the picker in case editable is false and opening it via a trigger click

@ExtAnimal 

we have an override for `onPickerTriggerClick()` which does not honor the `editable` config.

inside `form.field.Picker`, we do have `onInputClick()`, which triggers `togglePicker()`.

so, when editable is set to false, at first `doFilter()` gets called and then togglePicker(). it is a bit weird: after the `show()` call, a hide() call follows in real time. while i can not tell why the picker is not getting hidden right away, the hidden config does get changed to true. the result is that later `hide()` calls no longer work.

to fix this, i will just override `togglePicker()` to honor `doFilter()` and remove the `onPickerTriggerClick()` override. then editable true and false will both work again.

## Timeline

- 2024-04-12T10:57:04Z @tobiu added the `bug` label
- 2024-04-12T10:57:04Z @tobiu assigned to @tobiu
- 2024-04-12T10:57:24Z @tobiu referenced in commit `cdb3934` - "form.field.ComboBox: does not hide the picker in case editable is false and opening it via a trigger click #5390"
- 2024-04-12T10:57:46Z @tobiu closed this issue

