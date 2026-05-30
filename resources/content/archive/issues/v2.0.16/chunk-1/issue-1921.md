---
id: 1921
title: 'form.field.Text: autoComplete_ & autoCorrect_ configs'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-02T12:10:18Z'
updatedAt: '2021-05-02T13:00:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1921'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-02T13:00:40Z'
---
# form.field.Text: autoComplete_ & autoCorrect_ configs

Boolean

## Timeline

- 2021-05-02T12:10:18Z @tobiu added the `enhancement` label
- 2021-05-02T12:10:18Z @tobiu assigned to @tobiu
- 2021-05-02T12:17:43Z @tobiu referenced in commit `53970a4` - "form.field.Text: autoComplete_ & autoCorrect_ configs #1921"
- 2021-05-02T12:27:39Z @tobiu referenced in commit `eaf2b32` - "#1921 examples.form.field.text.MainContainer"
### @tobiu - 2021-05-02T12:28:25Z

looks like autocorrect is not inside the official specs:
https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/text

I will remove it and add a config for spellCheck_

- 2021-05-02T13:00:33Z @tobiu referenced in commit `0f4e5bc` - "#1921 spellCheck_"
- 2021-05-02T13:00:40Z @tobiu closed this issue

