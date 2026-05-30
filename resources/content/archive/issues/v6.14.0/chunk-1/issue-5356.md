---
id: 5356
title: 'form.field.Select: onListItemSelectionChange() => add a picker hide delay'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-03-18T20:35:36Z'
updatedAt: '2024-03-18T20:39:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5356'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-18T20:39:29Z'
---
# form.field.Select: onListItemSelectionChange() => add a picker hide delay

We do get console warnings otherwise, since selection DOM updates are on their way, but arrive once the picker is unmounted already.
<img width="1578" alt="Screenshot 2024-03-18 at 21 34 06" src="https://github.com/neomjs/neo/assets/1177434/6890c312-aa55-4d6e-80ff-596f01fc2451">

Alternatively, we could just disable the dom update warnings.

@ExtAnimal 

## Timeline

- 2024-03-18T20:35:36Z @tobiu added the `enhancement` label
- 2024-03-18T20:35:36Z @tobiu assigned to @tobiu
- 2024-03-18T20:39:26Z @tobiu referenced in commit `0d4e54c` - "form.field.Select: onListItemSelectionChange() => add a picker hide delay #5356"
- 2024-03-18T20:39:29Z @tobiu closed this issue
- 2024-03-26T16:29:48Z @tobiu referenced in commit `51fec27` - "form.field.Select: onListItemSelectionChange() => add a picker hide delay #5356"

