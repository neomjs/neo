---
id: 4274
title: 'form.field.CheckBox: uncheckedValue class field'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-04-12T10:05:28Z'
updatedAt: '2023-04-12T14:52:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4274'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-04-12T14:52:17Z'
---
# form.field.CheckBox: uncheckedValue class field

for use cases where there is just 1 checkbox (1 field with the same name, not a group), we might want to submit a value to the BE for the unchecked state.

we also need to adjust `form.Container: getValues()` to honor this.

## Timeline

- 2023-04-12T10:05:28Z @tobiu added the `enhancement` label
- 2023-04-12T10:05:28Z @tobiu assigned to @tobiu
- 2023-04-12T14:48:12Z @tobiu referenced in commit `db16649` - "form.field.CheckBox: uncheckedValue class field #4274"
- 2023-04-12T14:51:34Z @tobiu referenced in commit `8e270ce` - "#4274 fixed the form.Container logic, example inside the forms app"
- 2023-04-12T14:52:17Z @tobiu closed this issue

