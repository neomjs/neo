---
id: 4698
title: 'Neo.main.mixin.DeltaUpdates: du_updateNode() => support setting CSS vars on node level'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-08-11T10:12:41Z'
updatedAt: '2023-08-11T10:13:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4698'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-11T10:13:43Z'
---
# Neo.main.mixin.DeltaUpdates: du_updateNode() => support setting CSS vars on node level

like a button handler doing:
```
handler: function (data) {
    let style = this.style;
    style['--button-text-color'] = 'red';
    style.backgroundColor = '#eee !important';
    this.updateStyle(style)
},
```

## Timeline

- 2023-08-11T10:12:41Z @tobiu added the `enhancement` label
- 2023-08-11T10:12:41Z @tobiu assigned to @tobiu
- 2023-08-11T10:13:31Z @tobiu referenced in commit `c99a93b` - "Neo.main.mixin.DeltaUpdates: du_updateNode() => support setting CSS vars on node level #4698"
### @tobiu - 2023-08-11T10:13:43Z

<img width="1682" alt="Screenshot 2023-08-11 at 12 12 59" src="https://github.com/neomjs/neo/assets/1177434/70266d3f-2bf7-452e-9f5d-7600bbbc028a">


- 2023-08-11T10:13:43Z @tobiu closed this issue

