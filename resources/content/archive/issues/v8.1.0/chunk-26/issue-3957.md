---
id: 3957
title: Neo.applyClassConfig() => cleanup
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-01-29T23:04:24Z'
updatedAt: '2023-01-29T23:07:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3957'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-29T23:07:02Z'
---
# Neo.applyClassConfig() => cleanup

```
            let cfg = ctor.config || {},
                mixins;

            if (cfg) {
```

it looks like the if check is always true => we can remove it.

## Timeline

- 2023-01-29T23:04:24Z @tobiu added the `enhancement` label
- 2023-01-29T23:04:25Z @tobiu assigned to @tobiu
- 2023-01-29T23:07:00Z @tobiu referenced in commit `c80e135` - "Neo.applyClassConfig() => cleanup #3957"
- 2023-01-29T23:07:02Z @tobiu closed this issue

