---
id: 3954
title: 'form.field.Radio: remove the empty theming file'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-01-29T22:38:27Z'
updatedAt: '2023-01-29T22:39:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3954'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-29T22:39:00Z'
---
# form.field.Radio: remove the empty theming file

it looks like this file won't generate a matching CSS file, since there is no content.

<img width="680" alt="Screenshot 2023-01-29 at 23 36 00" src="https://user-images.githubusercontent.com/1177434/215359744-918913b4-791f-43c3-9986-caa60d8ca3e5.png">

we should just remove it for now.

## Timeline

- 2023-01-29T22:38:27Z @tobiu added the `bug` label
- 2023-01-29T22:38:27Z @tobiu assigned to @tobiu
### @tobiu - 2023-01-29T22:38:40Z

@maxrahder 

- 2023-01-29T22:38:55Z @tobiu referenced in commit `769dce9` - "form.field.Radio: remove the empty theming file #3954"
- 2023-01-29T22:39:00Z @tobiu closed this issue

