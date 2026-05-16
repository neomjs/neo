---
id: 2410
title: 'core.Util: typeOf() => support for null values'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-18T17:26:12Z'
updatedAt: '2021-06-18T17:47:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2410'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-18T17:47:28Z'
---
# core.Util: typeOf() => support for null values

*(No description provided)*

## Timeline

- 2021-06-18T17:26:12Z @tobiu added the `enhancement` label
- 2021-06-18T17:26:13Z @tobiu assigned to @tobiu
- 2021-06-18T17:26:26Z @tobiu referenced in commit `54029da` - "core.Util: typeOf() => support for null values #2410"
- 2021-06-18T17:26:35Z @tobiu closed this issue
- 2021-06-18T17:46:03Z @tobiu reopened this issue
### @tobiu - 2021-06-18T17:46:59Z

thinking more on this one:
We should add "Null" as a new return value. Almost every time we check for an object, we want it to not be null.

- 2021-06-18T17:47:19Z @tobiu referenced in commit `ce11be5` - "core.Util: typeOf() => support for null values #2410"
- 2021-06-18T17:47:28Z @tobiu closed this issue

