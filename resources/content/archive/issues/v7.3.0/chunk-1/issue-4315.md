---
id: 4315
title: 'form.field.Date : when setting "error" config value through change listener for date field does not show validation error message'
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-04-24T10:38:10Z'
updatedAt: '2024-09-12T02:29:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4315'
author: Ghost
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:22Z'
---
# form.field.Date : when setting "error" config value through change listener for date field does not show validation error message

{module: DateField,
  clearable: false,
  required: true,
  reference: 'dateField1',
  listeners: { change: 'onDateChange' }
},

Controller : 
 onDateChange(data) {
     let date1 = me.getReference('dateField1'),
     date1.error = 'newErrorText'
     }
     
     The validation error text  'newErrorText' is not displayed

## Timeline

- 2023-04-24T10:38:10Z @Ghost added the `bug` label
### @github-actions - 2024-08-29T02:27:27Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:28Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:22Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:22Z @github-actions closed this issue

