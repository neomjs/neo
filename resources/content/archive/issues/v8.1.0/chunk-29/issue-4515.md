---
id: 4515
title: 'form.Container: setValues() => no support for nested structures'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-06-27T17:21:10Z'
updatedAt: '2023-06-27T17:35:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4515'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-06-27T17:35:15Z'
---
# form.Container: setValues() => no support for nested structures

This bug sneaked into the framework when adding the `setConfigs()` method.

The current logic:
```
    async setValues(values={}, suspendEvents=false) {
        Object.entries(values).forEach(([key, value]) => {
            values[key] = {value}
        })

        await this.setConfigs(values, suspendEvents)
    }
```

is fine for simple forms, but not sufficient for nested structures.

All top level (root) items will get prefixed with `value`. However, we want to do this for all leave items instead.

This one will need testing!

@subramaniyamP: thanks for the heads up!

FYI: @dztoprak @Dinkh 

## Timeline

- 2023-06-27T17:21:10Z @tobiu added the `bug` label
- 2023-06-27T17:21:11Z @tobiu assigned to @tobiu
- 2023-06-27T17:30:08Z @tobiu referenced in commit `52792c1` - "form.Container: setValues() => no support for nested structures #4515"
- 2023-06-27T17:35:15Z @tobiu closed this issue

