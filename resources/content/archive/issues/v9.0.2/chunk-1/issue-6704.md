---
id: 6704
title: 'container.Base: createItem() => soften the parent.remove() call for existing instances'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2025-05-12T11:08:49Z'
updatedAt: '2025-05-12T11:09:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6704'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-05-12T11:09:12Z'
---
# container.Base: createItem() => soften the parent.remove() call for existing instances

* The logic was added to make moving views into different containers (e.g. browser windows) easier, since we no longer need to manually remove the target views
* There are exceptions though, where parents are not instances or extensions of `container.Base`, in which case `remove()` might not exist. Example: A ComboBox Picker.

## Timeline

- 2025-05-12T11:08:51Z @tobiu added the `bug` label
- 2025-05-12T11:09:06Z @tobiu referenced in commit `a03952d` - "container.Base: createItem() => soften the parent.remove() call for existing instances #6704"
- 2025-05-12T11:09:12Z @tobiu closed this issue

