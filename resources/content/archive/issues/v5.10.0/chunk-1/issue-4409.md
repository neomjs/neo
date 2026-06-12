---
id: 4409
title: buildScripts/createClass => update the singleton logic
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-05-11T14:06:54Z'
updatedAt: '2023-05-18T17:35:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4409'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-18T17:35:44Z'
---
# buildScripts/createClass => update the singleton logic

```
let instance = Neo.applyClassConfig(Cookie);

export default instance;
```

instead of the outdated old syntax

## Timeline

- 2023-05-11T14:06:54Z @tobiu added the `bug` label
- 2023-05-11T14:06:55Z @tobiu assigned to @tobiu
- 2023-05-18T17:35:34Z @tobiu referenced in commit `96ea6e8` - "buildScripts/createClass => update the singleton logic #4409"
- 2023-05-18T17:35:44Z @tobiu closed this issue

