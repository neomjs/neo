---
id: 4634
title: 'form.field.Text: label-position inline & no triggers prevents users from selecting the input field'
state: CLOSED
labels:
  - bug
  - help wanted
assignees: []
createdAt: '2023-08-04T09:19:51Z'
updatedAt: '2023-08-04T09:27:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4634'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-04T09:27:12Z'
---
# form.field.Text: label-position inline & no triggers prevents users from selecting the input field

this is an annoying one, which i just discovered. while the input node has a `z-index`, to appear on top of the label, this index will get ignored, when there is no input-wrapper (no triggers).

<img width="1954" alt="Screenshot 2023-08-04 at 11 17 26" src="https://github.com/neomjs/neo/assets/1177434/566ff087-eabc-475f-be2e-f5d92a2a95bc">


## Timeline

- 2023-08-04T09:19:51Z @tobiu added the `bug` label
- 2023-08-04T09:19:51Z @tobiu added the `help wanted` label
### @tobiu - 2023-08-04T09:23:12Z

well, i guess we can just remove the browser default and add `position: relative` instead.

- 2023-08-04T09:26:05Z @tobiu referenced in commit `373400a` - "form.field.Text: label-position inline & no triggers prevents users from selecting the input field #4634"
### @tobiu - 2023-08-04T09:27:12Z

needs testing for side effects.

- 2023-08-04T09:27:13Z @tobiu closed this issue

