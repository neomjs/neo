---
id: 1829
title: 'model.Component: the data properties capturing regex does not fit for dist/production anymore'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-20T12:02:02Z'
updatedAt: '2021-04-20T12:03:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1829'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-20T12:03:46Z'
---
# model.Component: the data properties capturing regex does not fit for dist/production anymore

while it does work fine for the development mode as well as dist/development, the minifying is a problem here.
```
value: data => `${data.button1Text}`
```

will get changed to e.g.:
```
value: e => `${e.button1Text}`
```
so we need a capturing group to check for "data" or a single character

## Timeline

- 2021-04-20T12:02:02Z @tobiu added the `enhancement` label
- 2021-04-20T12:02:02Z @tobiu assigned to @tobiu
- 2021-04-20T12:03:37Z @tobiu referenced in commit `446fef4` - "model.Component: the data properties capturing regex does not fit for dist/production anymore #1829"
- 2021-04-20T12:03:46Z @tobiu closed this issue
- 2021-04-20T12:06:34Z @tobiu cross-referenced by #1830

