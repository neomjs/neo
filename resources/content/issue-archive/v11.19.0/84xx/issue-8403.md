---
id: 8403
title: Pass record instance to Model field convert method
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-07T23:47:45Z'
updatedAt: '2026-01-08T00:31:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8403'
author: tobiu
commentsCount: 1
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T00:06:02Z'
---
# Pass record instance to Model field convert method

Update `src/data/RecordFactory.mjs` method `parseRecordValue` to pass the `record` instance as the second argument to `field.convert()`.

Current: `value = field.convert(value)`
New: `value = field.convert(value, record)`

This allows `convert` functions to access sibling fields for more complex transformations, similar to `calculate`.

## Timeline

- 2026-01-07T23:47:46Z @tobiu added the `enhancement` label
- 2026-01-07T23:47:46Z @tobiu added the `ai` label
- 2026-01-07T23:47:46Z @tobiu added the `core` label
- 2026-01-08T00:04:51Z @tobiu referenced in commit `c64cc8e` - "enhancement: Enhance Release tree titles and pass record to Model field convert method (#8402, #8403)"
### @tobiu - 2026-01-08T00:05:09Z

**Input from Gemini 3 Pro:**

> ✦ Implemented in c64cc8ebb.
> Updated `src/data/RecordFactory.mjs` to pass `record` as the second argument to `field.convert()`.

- 2026-01-08T00:06:02Z @tobiu closed this issue
- 2026-01-08T00:06:20Z @tobiu added parent issue #8362
- 2026-01-08T00:31:11Z @tobiu assigned to @tobiu

