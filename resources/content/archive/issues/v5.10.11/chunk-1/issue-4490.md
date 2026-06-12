---
id: 4490
title: util.StringUtil cleanup
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-05-31T16:21:30Z'
updatedAt: '2024-09-26T12:34:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4490'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-06-26T13:19:52Z'
---
# util.StringUtil cleanup

We should order the methods according to our coding guidelines:
<img width="835" alt="Screenshot 2023-05-31 at 18 15 36" src="https://github.com/neomjs/neo/assets/1177434/782d0721-bc31-4c44-b8ac-81075048a0a9">

We could also cache the regex inside `unescapeHtml()` into a static class field.

## Timeline

- 2023-05-31T16:21:30Z @tobiu added the `enhancement` label
- 2023-06-19T09:17:36Z @tobiu assigned to @Ghost
- 2023-06-24T15:37:56Z @Ghost cross-referenced by PR #4513
- 2023-06-26T08:36:42Z @tobiu closed this issue
### @tobiu - 2023-06-26T13:13:56Z

i will add a bit more polishing:

- static configs order & comments
- method order
- static regex => new ctor not needed

- 2023-06-26T13:13:56Z @tobiu reopened this issue
- 2023-06-26T13:16:29Z @tobiu referenced in commit `0968069` - "util.StringUtil cleanup #4490"
- 2023-06-26T13:17:20Z @tobiu referenced in commit `ab40001` - "#4490 neo className"
### @tobiu - 2023-06-26T13:19:52Z

done now.

@dztoprak since there are many dependencies between static methods and static configs, another way to implement this would be converting the class into a singleton. example: https://github.com/neomjs/neo/blob/dev/src/util/Logger.mjs#L29

feel free to create a follow-up ticket, in case you like the singleton idea better.

- 2023-06-26T13:19:53Z @tobiu closed this issue

