---
id: 5778
title: 'Portal App: adjust the index.html for minification'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-18T10:22:17Z'
updatedAt: '2024-08-18T10:22:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5778'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-18T10:22:37Z'
---
# Portal App: adjust the index.html for minification

currently, our minifier can not handle line breaks inside tags:
```
<link
        href="...">
```

will result in (broken):
```
<linkhref="...">
```

while we could adjust the parser, let us reformat the link as a quick win.

## Timeline

- 2024-08-18T10:22:17Z @tobiu added the `enhancement` label
- 2024-08-18T10:22:17Z @tobiu assigned to @tobiu
- 2024-08-18T10:22:32Z @tobiu referenced in commit `a740bf6` - "Portal App: adjust the index.html for minification #5778"
- 2024-08-18T10:22:37Z @tobiu closed this issue

