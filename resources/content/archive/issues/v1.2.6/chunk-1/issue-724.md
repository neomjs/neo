---
id: 724
title: 'component.wrapper.AmChart: data_ config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-14T16:22:25Z'
updatedAt: '2020-06-14T17:22:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/724'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-14T17:22:03Z'
---
# component.wrapper.AmChart: data_ config

right now, Covid.view.TableContainerController is calling:

```
        Neo.main.addon.AmCharts.updateData({
            data    : dataArray,
            dataPath: chart.dataPath,
            id      : chart.id
        });
```

instead, it should just change the data config on the wrapper component.

cleaner, plus allows us to automatically apply the last data when moving charts into different windows.

## Timeline

- 2020-06-14T16:22:25Z @tobiu added the `enhancement` label
- 2020-06-14T16:22:25Z @tobiu assigned to @tobiu
- 2020-06-14T17:21:31Z @tobiu referenced in commit `0c3c1ce` - "component.wrapper.AmChart: data_ config #724"
- 2020-06-14T17:22:03Z @tobiu closed this issue

