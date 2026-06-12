---
id: 702
title: 'create-app program: simplify the app.mjs file'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-10T20:16:40Z'
updatedAt: '2020-06-10T20:19:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/702'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-10T20:19:54Z'
---
# create-app program: simplify the app.mjs file

```
Neo.onStart = function() {
    Neo.app({
        appPath : 'apps/sharedcovid2/',
        mainView: MainContainer,
        name    : 'Covid2'
    });
};
```
should be
```
Neo.onStart = () => Neo.app({
    appPath : 'apps/sharedcovid2/',
    mainView: MainContainer,
    name    : 'Covid2'
});
```

## Timeline

- 2020-06-10T20:16:40Z @tobiu added the `enhancement` label
- 2020-06-10T20:16:40Z @tobiu assigned to @tobiu
- 2020-06-10T20:19:50Z @tobiu referenced in commit `84d55da` - "create-app program: simplify the app.mjs file #702"
- 2020-06-10T20:19:54Z @tobiu closed this issue

