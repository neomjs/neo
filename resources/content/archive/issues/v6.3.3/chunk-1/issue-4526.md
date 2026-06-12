---
id: 4526
title: 'CheckBox Component: get/set value property issue'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-07-04T07:51:02Z'
updatedAt: '2023-09-04T13:09:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4526'
author: alberthashani
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-04T13:09:26Z'
---
# CheckBox Component: get/set value property issue

Checkbox component has an issue with getValue() method. if the value property is set externally to e.g. true, it will persist as true no matter what we set.

 getValue logic ->  return me.checked ? me.value : me.uncheckedValue

## Timeline

- 2023-07-04T07:51:02Z @alberthashani added the `bug` label
- 2023-07-04T08:00:13Z @alberthashani changed title from **CheckBox Component: value set issue** to **CheckBox Component: get/set value property issue**
### @tobiu - 2023-07-04T08:25:32Z

Hi Albert. We are kind of not supposed to change the value config at run-time, although it is possible.

value means “what do we want to submit in case the field is checked?” which is the same for most use cases.

dynamically changing the checked config will check or uncheck the field.

there is more to it when it comes to checkbox groups. There, the BE will send an array of values and only for included fields will get checked. For this part, take a look into form.Container: setConfigs().

greetings from Munich :)

### @tobiu - 2023-07-04T08:29:30Z

Thinking more about it: we probably could add a “getGroupValue()” method, in case it helps.

### @alberthashani - 2023-07-07T09:34:07Z

Hi Tobi, thanks for the detailed response. Currently we have this issue only with a checkbox in a single context, no groups.
Simply put, the checkbox X has a loaded value from the back-end for example: true, when checkbox is clicked it will assign true to it again instead of false, due to the logic in the getValue function. Let's have a call soon, and I can show you what I mean.

### @alberthashani - 2023-09-04T13:09:26Z

This is fixed now.

- 2023-09-04T13:09:26Z @alberthashani closed this issue

