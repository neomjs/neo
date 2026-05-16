---
id: 517
title: webpack.config.main => different asset names in mode prod
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-01T09:32:20Z'
updatedAt: '2020-05-01T09:34:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/517'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-01T09:34:33Z'
---
# webpack.config.main => different asset names in mode prod

dev-build-main:
```
                   Asset      Size                 Chunks             Chunk Names
                 main.js   405 KiB                   main  [emitted]  main
src/main/lib/AmCharts.js  21.8 KiB  src/main/lib/AmCharts  [emitted]  src/main/lib/AmCharts
```

prod-build-main:
```
  Asset      Size  Chunks             Chunk Names
   1.js  2.29 KiB       1  [emitted]  src/main/lib/AmCharts
main.js  41.5 KiB       0  [emitted]  main

```

the asset names in dev & prod do not match, obviously we want the dev version one.

the chunk name is defined indirectly in Main.mjs:
```
if (Neo.config.useAmCharts) {
    await import(/* webpackChunkName: 'src/main/lib/AmCharts' */ './main/lib/AmCharts.mjs');
}
```

## Timeline

- 2020-05-01T09:32:20Z @tobiu added the `enhancement` label
- 2020-05-01T09:32:20Z @tobiu assigned to @tobiu
- 2020-05-01T09:33:48Z @tobiu referenced in commit `c9fb0df` - "webpack.config.main => different asset names in mode prod #517"
### @tobiu - 2020-05-01T09:34:33Z

```
                   Asset      Size  Chunks             Chunk Names
                 main.js  41.5 KiB       0  [emitted]  main
src/main/lib/AmCharts.js  2.29 KiB       1  [emitted]  src/main/lib/AmCharts
```

chunkFilename: '[name].js'

fixes this in prod.

- 2020-05-01T09:34:33Z @tobiu closed this issue

