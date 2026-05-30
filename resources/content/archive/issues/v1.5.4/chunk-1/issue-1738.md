---
id: 1738
title: 'model.Component: resolveFormatter() => keep the generated function as minimal as possible'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-09T13:08:04Z'
updatedAt: '2021-04-09T13:09:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1738'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-09T13:09:11Z'
---
# model.Component: resolveFormatter() => keep the generated function as minimal as possible

@bhaustein mentioned that it would be nicer to move the
```Javascript
if (!data) {
    data = this.getHierarchyData();
}
```

part out of the generated fn. Since we are only calling it inside `resolveFormatter()` I agree.

## Timeline

- 2021-04-09T13:08:04Z @tobiu added the `enhancement` label
- 2021-04-09T13:08:04Z @tobiu assigned to @tobiu
- 2021-04-09T13:09:03Z @tobiu referenced in commit `9cc52ce` - "model.Component: resolveFormatter() => keep the generated function as minimal as possible #1738"
- 2021-04-09T13:09:11Z @tobiu closed this issue

