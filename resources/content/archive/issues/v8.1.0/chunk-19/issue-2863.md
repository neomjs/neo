---
id: 2863
title: app.mjs files => check if we can simplify the export statements
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-02-01T14:37:42Z'
updatedAt: '2022-02-01T19:50:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2863'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-02-01T19:50:46Z'
---
# app.mjs files => check if we can simplify the export statements

*(No description provided)*

## Timeline

- 2022-02-01T14:37:42Z @tobiu added the `enhancement` label
- 2022-02-01T14:37:42Z @tobiu assigned to @tobiu
### @tobiu - 2022-02-01T19:14:25Z

```
import MainContainer from './view/MainContainer.mjs';

export const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'Covid'
});
```


- 2022-02-01T19:32:00Z @tobiu referenced in commit `efa0c6a` - "app.mjs files => check if we can simplify the export statements #2863"
- 2022-02-01T19:50:47Z @tobiu closed this issue

