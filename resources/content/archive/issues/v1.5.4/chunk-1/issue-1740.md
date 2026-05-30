---
id: 1740
title: examples.model.Table
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-09T17:47:07Z'
updatedAt: '2021-04-09T20:07:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1740'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-09T20:07:56Z'
---
# examples.model.Table

To further develop and test the model.Component stores config, we need a new example (app).

I will copy an existing table example, add a view model class, create the store there and then add a binding inside the table view.

## Timeline

- 2021-04-09T17:47:07Z @tobiu added the `enhancement` label
- 2021-04-09T17:47:07Z @tobiu assigned to @tobiu
- 2021-04-09T18:03:06Z @tobiu referenced in commit `bceed47` - "#1740 copied the tableStore example, adjusted the paths (different folder level), adjusted the app name."
- 2021-04-09T18:08:52Z @tobiu referenced in commit `4a1a2f5` - "#1740 examples.model.table.MainContainer: removed the 2 toolbars at the top to keep the example as simple as possible"
- 2021-04-09T18:10:34Z @tobiu referenced in commit `93b1a7c` - "#1740 examples.model.table.MainContainer: table columns formatting"
- 2021-04-09T18:17:00Z @tobiu referenced in commit `a4d4159` - "#1740 Neo.examples.model.table.MainContainerModel: base class, added into the MainContainer"
- 2021-04-09T18:28:20Z @tobiu referenced in commit `0615a8b` - "#1740 examples.model.table.MainContainer: top level doc comments"
- 2021-04-09T18:30:58Z @tobiu referenced in commit `a568d22` - "#1740 examples.model.table.MainContainerModel: imported the main example store and added it into the stores config"
- 2021-04-09T20:06:58Z @tobiu referenced in commit `d5ba881` - "#1740 examples.model.table.MainContainer: removed the store import, added a store binding"
### @tobiu - 2021-04-09T20:07:56Z

the first PoC is working now:

![Screenshot 2021-04-09 at 22 07 30](https://user-images.githubusercontent.com/1177434/114235116-00031e00-9980-11eb-9cf3-282e5ab12c9e.png)


- 2021-04-09T20:07:56Z @tobiu closed this issue

