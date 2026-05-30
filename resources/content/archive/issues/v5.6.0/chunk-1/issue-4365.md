---
id: 4365
title: 'form.field.Url: beforeGetValue()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-05-02T19:05:43Z'
updatedAt: '2023-05-02T19:07:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4365'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-02T19:07:17Z'
---
# form.field.Url: beforeGetValue()

the default URL ctor has some sanity checks to convert an "almost" valid URL into a real one.

e.g. new URL("http:www.google.com").href => "http://www.google.com"

## Timeline

- 2023-05-02T19:05:43Z @tobiu added the `enhancement` label
- 2023-05-02T19:05:44Z @tobiu assigned to @tobiu
- 2023-05-02T19:07:12Z @tobiu referenced in commit `df69174` - "form.field.Url: beforeGetValue() #4365"
- 2023-05-02T19:07:17Z @tobiu closed this issue

