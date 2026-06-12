---
id: 4799
title: 'form.field.Select: editable false & focusLeave is not hiding the picker'
state: CLOSED
labels:
  - bug
  - help wanted
assignees: []
createdAt: '2023-08-30T09:38:13Z'
updatedAt: '2023-12-05T12:14:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4799'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-12-05T12:14:21Z'
---
# form.field.Select: editable false & focusLeave is not hiding the picker

this one is tricky: in case `editable: true`, we can open the picker by clicking on the related trigger. once we click somewhere else, the picker will get hidden `onFocusLeave()`.

however, when using `editable: false`, the picker will also show in case we click on the input node. This node has the CSS rules
```
pointer-events: none;
user-select: none;
```

i think this one is confusing `manager.Focus`, since the field is not receiving it on a click => focussing something else does not trigger `onFocusLeave()` => the picker won't hide.

my first idea was that clicking on the input node could pass the focus to the picker trigger. however in that case, clicking on the input node again can trigger a focus leave.

we need a clean concept, how to best solve this issue.

@mxmrtns @ExtAnimal @Dinkh @dztoprak @hergerger1971 

## Timeline

- 2023-08-30T09:38:13Z @tobiu added the `bug` label
- 2023-08-30T09:38:13Z @tobiu added the `help wanted` label
### @tobiu - 2023-08-30T09:42:01Z

we can reproduce the issue here:
https://neomjs.github.io/pages/node_modules/neo.mjs/dist/production/examples/form/field/select/index.html

=> uncheck the `editable` CheckBox on the right side. Click on the input node of the SelectField, click somewhere else (e.g. focus a different field).

- 2023-10-04T11:44:30Z @stokedowl referenced in commit `2a6dd4d` - "Fix picker not hiding on onFocusLeave with editable: false in form.field.Select (#4799)"
- 2023-10-04T11:57:24Z @stokedowl cross-referenced by PR #4971
### @tobiu - 2023-12-05T12:14:21Z

should be resolved by @ExtAnimal 

- 2023-12-05T12:14:21Z @tobiu closed this issue

