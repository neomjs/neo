---
id: 4037
title: 'util.HashHistory: push() => ignore duplicate entries'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-02-12T20:26:14Z'
updatedAt: '2023-02-12T20:26:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4037'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-12T20:26:56Z'
---
# util.HashHistory: push() => ignore duplicate entries

while the browser-based hashchange event won't trigger for changes to the same value, other internal logic could do this.

one such example is `controller.Application`:
```
        me.importApp(path).then(module => {
            module.onStart();

            // short delay to ensure Component Controllers are ready
            config.hash && setTimeout(() => HashHistory.push(config.hash), 5);
        });
```

## Timeline

- 2023-02-12T20:26:14Z @tobiu added the `enhancement` label
- 2023-02-12T20:26:14Z @tobiu assigned to @tobiu
- 2023-02-12T20:26:48Z @tobiu referenced in commit `8605cba` - "util.HashHistory: push() => ignore duplicate entries #4037"
- 2023-02-12T20:26:56Z @tobiu closed this issue

