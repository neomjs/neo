---
id: 5396
title: Neo.isRecord() does not work in dist/production
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-04-16T08:52:29Z'
updatedAt: '2024-04-16T09:06:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5396'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-04-16T08:53:53Z'
---
# Neo.isRecord() does not work in dist/production

```
    static isRecord(value) {
        return value?.constructor?.name === 'Record' || false
    }
```

While we could change the logic to: `item.isRecord` (we do set a custom flag), the ctor name does get minified.

Since we are not minifying neo classNames I would argue that we should also not minify the name "Record", to give devs better chances of debugging inside dist/prod when needed.

## Timeline

- 2024-04-16T08:52:29Z @tobiu added the `bug` label
- 2024-04-16T08:52:30Z @tobiu assigned to @tobiu
- 2024-04-16T08:53:29Z @tobiu referenced in commit `42592c6` - "Neo.isRecord() does not work in dist/production #5396"
- 2024-04-16T08:53:53Z @tobiu closed this issue

