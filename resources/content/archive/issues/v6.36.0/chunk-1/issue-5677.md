---
id: 5677
title: 'component.Video: remove beforeSetPlaying()'
state: CLOSED
labels:
  - enhancement
assignees:
  - Dinkh
createdAt: '2024-08-03T18:45:41Z'
updatedAt: '2024-08-10T16:17:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5677'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-10T16:17:23Z'
---
# component.Video: remove beforeSetPlaying()

```
    beforeSetPlaying(value, oldValue) {
        if (!Neo.isBoolean(value)) {
            return oldValue
        }

        return value
    }
```

Validating a boolean on class level is pointless. Doing a check for specific enum values is fine, but when it comes to base types, this is way over the top. Imagine we would add `beforeSetX()` for every possible boolean, number or string config inside the framework.

We can think about generic config type checkings, but this is not the way to go.

## Timeline

- 2024-08-03T18:45:41Z @tobiu added the `enhancement` label
- 2024-08-03T18:45:41Z @tobiu assigned to @Dinkh
### @Dinkh - 2024-08-10T16:17:23Z

removed

- 2024-08-10T16:17:23Z @Dinkh closed this issue

