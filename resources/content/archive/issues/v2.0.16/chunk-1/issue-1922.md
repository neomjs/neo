---
id: 1922
title: 'form.field.Text: spellCheck => delta updates'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-02T13:03:01Z'
updatedAt: '2021-05-02T13:06:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1922'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-02T13:06:15Z'
---
# form.field.Text: spellCheck => delta updates

initially using false will set the attribute correctly.

`inputTextNode[spellcheck] = 'true';` works fine.

`inputTextNode[spellcheck] = 'false';` does not work.

`inputTextNode[spellcheck] = false;` works.

only tested in chromium and feels like a bug. will adjust the delta update logic.

## Timeline

- 2021-05-02T13:03:01Z @tobiu added the `enhancement` label
- 2021-05-02T13:03:01Z @tobiu assigned to @tobiu
- 2021-05-02T13:06:08Z @tobiu referenced in commit `653f175` - "form.field.Text: spellCheck => delta updates #1922"
- 2021-05-02T13:06:15Z @tobiu closed this issue

