---
id: 500
title: buildScripts/buildAll.js => add a check for build-dev & build-prod
state: CLOSED
labels:
  - enhancement
  - good first issue
assignees: []
createdAt: '2020-04-20T23:27:45Z'
updatedAt: '2020-04-22T08:25:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/500'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-04-22T08:25:53Z'
---
# buildScripts/buildAll.js => add a check for build-dev & build-prod

those 2 scripts are not needed for apps (e.g. the covid dashboard app repo).

buildAll should grab the package.json and check if these 2 scripts exist and only then run

```
// neo dist versions => examples, docs app
cp.spawnSync(npmCmd, ['run', 'build-development'],        cpOpts);
cp.spawnSync(npmCmd, ['run', 'build-production'],         cpOpts);
```

## Timeline

- 2020-04-20T23:27:45Z @tobiu added the `enhancement` label
- 2020-04-20T23:27:45Z @tobiu added the `good first issue` label
- 2020-04-20T23:28:47Z @tobiu cross-referenced by #3
- 2020-04-22T08:09:48Z @tobiu referenced in commit `96f2673` - "buildScripts/buildAll.js => add a check for build-dev & build-prod #500"
- 2020-04-22T08:25:53Z @tobiu closed this issue

