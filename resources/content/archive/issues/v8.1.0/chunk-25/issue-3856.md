---
id: 3856
title: 'form.field.CheckBox: JS based icon classes'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-01-14T21:08:06Z'
updatedAt: '2023-01-14T21:12:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3856'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-14T21:12:44Z'
---
# form.field.CheckBox: JS based icon classes

sadly, it is not easily possible to use dynamic content in pseudo elements, like:
```
&::after {
    content: var(--neo-icon-checked)
}
```

since the browser does not acknowledge this to be a string and does not render the node at all.

so, we do need JS based configs instead.

## Timeline

- 2023-01-14T21:08:06Z @tobiu added the `enhancement` label
- 2023-01-14T21:08:06Z @tobiu assigned to @tobiu
- 2023-01-14T21:11:51Z @tobiu referenced in commit `b55242b` - "form.field.CheckBox: JS based icon classes #3856"
- 2023-01-14T21:12:44Z @tobiu closed this issue

