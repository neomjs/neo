---
id: 531
title: 'Neo.main.onDomContentLoaded: ensure the dynamic imports run in parallel'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-03T18:16:36Z'
updatedAt: '2020-05-03T18:34:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/531'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-03T18:34:01Z'
---
# Neo.main.onDomContentLoaded: ensure the dynamic imports run in parallel

```
        if (Neo.config.useAmCharts) {
            await import(/* webpackChunkName: 'src/main/lib/AmCharts' */ './main/lib/AmCharts.mjs');
        }

        if (Neo.config.useMapboxGL) {
            await import(/* webpackChunkName: 'src/main/lib/MapboxGL' */ './main/lib/MapboxGL.mjs');
        }
```

this needs to switch to a promiseAll => we do not want to wait for each import to be finished before starting the next one.

on it.

## Timeline

- 2020-05-03T18:16:36Z @tobiu added the `enhancement` label
- 2020-05-03T18:16:36Z @tobiu assigned to @tobiu
- 2020-05-03T18:27:44Z @tobiu referenced in commit `d5faf8f` - "Neo.main.onDomContentLoaded: ensure the dynamic imports run in parallel #531"
- 2020-05-03T18:33:20Z @tobiu referenced in commit `13d4f7c` - "#531 cleanup => no need to delay the inclusion of the GA script tag"
### @tobiu - 2020-05-03T18:34:01Z

<img width="1165" alt="Screenshot 2020-05-03 at 20 32 28" src="https://user-images.githubusercontent.com/1177434/80922430-67cae500-8d7d-11ea-9285-2a6b85011a14.png">


- 2020-05-03T18:34:01Z @tobiu closed this issue

