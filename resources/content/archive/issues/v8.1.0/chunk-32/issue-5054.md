---
id: 5054
title: 'tab.header.Button: ARIA roles'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2023-10-25T14:49:57Z'
updatedAt: '2024-09-13T02:28:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5054'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:28:48Z'
---
# tab.header.Button: ARIA roles

https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/tab_role

as a start, we need to add:
1. role
2. aria-selected
3. aria-controls

## Timeline

- 2023-10-25T14:49:57Z @tobiu added the `enhancement` label
- 2023-10-25T14:50:49Z @tobiu assigned to @tobiu
- 2023-10-25T15:17:04Z @tobiu referenced in commit `fe0af93` - "tab.header.Button: ARIA roles #5054 => role, aria-selected"
### @tobiu - 2023-10-25T15:18:31Z

`aria-controls` is tricky: each button needs the `tabpanel` id, which means inside the aria context the card id.

this one might not even exist so we need a TabPanel based id creation logic.

- 2023-10-30T16:15:51Z @tobiu referenced in commit `d52eeec` - "v6.9.4 (#5059)

* tab.header.Button: ARIA roles #5054 => role, aria-selected

* form.field.Picker: adjust pickerIsMounted #5056

* moving param position

* dependencies update => sass is now supporting node v21.

* controller.Base: config & method order

* controller.Base: refactoring & code cleanup

* v6.9.4"
### @github-actions - 2024-08-29T02:26:25Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:26Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:28:47Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:28:48Z @github-actions closed this issue

