---
id: 4705
title: 'main.mixin.DeltaUpdates: du_changeNodeName()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-08-13T19:36:29Z'
updatedAt: '2023-08-13T19:41:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4705'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-13T19:41:41Z'
---
# main.mixin.DeltaUpdates: du_changeNodeName()

@ExtAnimal would like to change tag names at run-time. We need a small algorithm to handle it.

## Timeline

- 2023-08-13T19:36:29Z @tobiu added the `enhancement` label
- 2023-08-13T19:36:29Z @tobiu assigned to @tobiu
### @tobiu - 2023-08-13T19:40:59Z

e.g.: a button handler could do
```
            handler: function(data) {
                this.vdom.tag = 'a';
                this.update()
            },
```

- 2023-08-13T19:41:27Z @tobiu referenced in commit `fe4fd6e` - "main.mixin.DeltaUpdates: du_changeNodeName() #4705"
### @tobiu - 2023-08-13T19:41:41Z

<img width="1622" alt="Screenshot 2023-08-13 at 21 36 59" src="https://github.com/neomjs/neo/assets/1177434/5e9b490f-13ab-4ab8-b960-6bf9e6d961d9">


- 2023-08-13T19:41:41Z @tobiu closed this issue

