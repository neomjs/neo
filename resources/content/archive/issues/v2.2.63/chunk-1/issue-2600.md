---
id: 2600
title: 'form.field.CheckBox: afterSetId()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-12T13:30:00Z'
updatedAt: '2021-07-12T13:30:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2600'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-12T13:30:33Z'
---
# form.field.CheckBox: afterSetId()

move the sub item id generation out of the`constructor` into its own method.

use case: `calendar.view.calendars.List` is re-using checkbox field instances and dynamically updating the instance ids to match the list item record.

in case the main field id changes, but the child items do not, the vdom engine is in trouble. especially in case we are deleting list records from the store.

## Timeline

- 2021-07-12T13:30:00Z @tobiu added the `enhancement` label
- 2021-07-12T13:30:00Z @tobiu assigned to @tobiu
- 2021-07-12T13:30:26Z @tobiu referenced in commit `c4539e3` - "form.field.CheckBox: afterSetId() #2600"
- 2021-07-12T13:30:33Z @tobiu closed this issue

