---
id: 5082
title: 'form.field.Text: add a trim() logic for submitting values'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-11-04T16:44:54Z'
updatedAt: '2023-11-06T11:04:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5082'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-11-06T11:04:03Z'
---
# form.field.Text: add a trim() logic for submitting values

@linchen, @ThorstenRaab: i had to revert your idea for a fix:
https://github.com/neomjs/neo/pull/5081

since it was causing multiple new bugs. e.g. NumberField extends TextField. so if you just transform whatever type of value which is coming in into a string, it will break.

also, we do need a proper if condition for:
```
data.value ? data.value.toString().trim() : me.emptyValue
```

if `data.value` equals 0, it will get changed to the emptyValue.

## Timeline

- 2023-11-04T16:44:54Z @tobiu added the `enhancement` label
- 2023-11-04T16:44:54Z @tobiu assigned to @tobiu
- 2023-11-04T17:23:15Z @tobiu referenced in commit `6b09495` - "form.field.Text: add a trim() logic for submitting values #5082"
### @tobiu - 2023-11-04T17:23:51Z

^ we can probably go for this one, in case we only want to trim user inputs and not programmatic values.

- 2023-11-06T10:45:21Z @tobiu referenced in commit `38e1574` - "#5082 onFocusLeave() => trim()"
- 2023-11-06T11:04:03Z @tobiu closed this issue
- 2023-11-06T11:11:18Z @tobiu referenced in commit `0d464f5` - "v6.9.9 (#5084)

* main.addon.HighlightJS: removed setConfigs() => obsolete

* reverting the main merge

* Revert "fix(dev-7228): value of input field should be trimmed before submission to backend (#5078)"

This reverts commit 4634a0c0f628ccf195d43426ae82ce0a1791c155.

* form.field.Text: add a trim() logic for submitting values #5082

* Style tweaks to learnneo

* ability to escape outgoing values from textfield (#5083)

* ability to escape outgoing values from textfield

* fixed code formatting

* cleanup

* #5082 onFocusLeave() => trim()

* dependencies update

* v6.9.9"

