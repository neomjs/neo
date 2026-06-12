---
id: 5378
title: 'form.field.ComboBox: updateValueFromInputValue() => needs to clear selections'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-04-03T15:26:54Z'
updatedAt: '2024-04-03T15:27:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5378'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-04-03T15:27:25Z'
---
# form.field.ComboBox: updateValueFromInputValue() => needs to clear selections

while we are already clearing the record when typing (silently), this also needs to remove list selections.

rationale: select an item, remove one or more characters, click on the same item (still selected, not clickable).

## Timeline

- 2024-04-03T15:26:54Z @tobiu added the `bug` label
- 2024-04-03T15:26:54Z @tobiu assigned to @tobiu
- 2024-04-03T15:27:19Z @tobiu referenced in commit `5540b4b` - "form.field.ComboBox: updateValueFromInputValue() => needs to clear selections #5378"
- 2024-04-03T15:27:25Z @tobiu closed this issue

