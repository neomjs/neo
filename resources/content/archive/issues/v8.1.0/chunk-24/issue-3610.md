---
id: 3610
title: list.Description
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-12-16T15:59:11Z'
updatedAt: '2022-12-16T17:49:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3610'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-12-16T17:49:57Z'
---
# list.Description

for lists which contain (multiple) headers, `ul` and `li` tags don't feel like a good choice.

i will try out a version using `dl` tags:
https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dl

the keyboard navigation needs to get adjusted to skip list headers inside this use case.

e.g. a boolean `isHeader` model field

## Timeline

- 2022-12-16T15:59:11Z @tobiu added the `enhancement` label
- 2022-12-16T15:59:12Z @tobiu assigned to @tobiu
### @tobiu - 2022-12-16T17:49:57Z

closed in favor for enhancing `list.Base` with a `useHeaders` config.

- 2022-12-16T17:49:57Z @tobiu closed this issue

