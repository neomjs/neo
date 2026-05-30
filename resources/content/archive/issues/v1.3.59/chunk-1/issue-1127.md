---
id: 1127
title: button.Split
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-08-22T15:48:13Z'
updatedAt: '2020-08-24T15:16:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1127'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-24T15:16:53Z'
---
# button.Split

We do need Split-Buttons for showing menues later on.

We need this markup in general:
```
<div>
    <button></button>
    <button></button>
</div>
```

We can still extend Button and just set the vdomRoot on the first button.

The second button-tag can extend button as well and get put into the new vdom structure.

## Timeline

- 2020-08-22T15:48:13Z @tobiu added the `enhancement` label
- 2020-08-24T13:20:17Z @tobiu referenced in commit `1d891f5` - "#1127 button.Split: class comment"
- 2020-08-24T13:23:12Z @tobiu referenced in commit `3f2f198` - "#1127 button.Split: ctor => creating the 2nd Button instance"
- 2020-08-24T13:35:28Z @tobiu referenced in commit `6771b07` - "#1127 button.Split: splitButton, splitButtonConfig configs"
- 2020-08-24T13:44:36Z @tobiu referenced in commit `76e6d3d` - "#1127 button.Split: scss src file"
- 2020-08-24T13:50:34Z @tobiu referenced in commit `71438c3` - "#1127 button.Split: splitButtonConfig, splitButtonIconCls()"
- 2020-08-24T13:52:53Z @tobiu referenced in commit `abdb0d9` - "#1127 button.Split: caret-down as the default split button iconCls"
- 2020-08-24T14:00:43Z @tobiu referenced in commit `cb47992` - "#1127 button.Split: styling"
- 2020-08-24T14:10:27Z @tobiu referenced in commit `07d5e6a` - "#1127 button.Split: default splitButtonHandler()"
- 2020-08-24T15:16:53Z @tobiu closed this issue

