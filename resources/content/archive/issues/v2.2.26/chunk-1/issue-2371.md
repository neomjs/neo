---
id: 2371
title: 'model.Component: enhance the dataVariableRegex'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-15T18:30:41Z'
updatedAt: '2021-06-15T20:21:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2371'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-15T20:21:14Z'
---
# model.Component: enhance the dataVariableRegex

```
const dataVariableRegex  = /(data|[a-z])((?!(\.[a-z_]\w*\(\)))\.[a-z_]\w*)+/gi;
```

this one worked for template literals containing data variables or 1 letter vars (dist/prod).

however, there is a catch :)

![Screenshot 2021-06-15 at 20 29 31](https://user-images.githubusercontent.com/1177434/122104874-6d1baf80-ce18-11eb-997a-215fea7d7c5b.png)

in case we want to support methods including dots, we need more polishing.

new idea:
```
const dataVariableRegex  = /(data|(?<!\w)[a-z])((?!(\.[a-z_]\w*\(\)))\.[a-z_]\w*)+/gi;
```

![Screenshot 2021-06-15 at 20 29 40](https://user-images.githubusercontent.com/1177434/122104965-891f5100-ce18-11eb-912c-a8a08d9c319b.png)

## Timeline

- 2021-06-15T18:30:41Z @tobiu added the `enhancement` label
- 2021-06-15T18:30:41Z @tobiu assigned to @tobiu
### @tobiu - 2021-06-15T18:50:18Z

it does get more tricky: dist/prod does not only minify method names.

`data => DateUtil.convertToyyyymmdd(data.currentDate)`

does get transformed into:

`e=>s.Z.convertToyyyymmdd(e.currentDate)`

- 2021-06-15T20:06:12Z @tobiu referenced in commit `218c5d3` - "model.Component: enhance the dataVariableRegex #2371 PoC"
- 2021-06-15T20:17:07Z @tobiu referenced in commit `9c6b645` - "model.Component: enhance the dataVariableRegex #2371"
- 2021-06-15T20:21:14Z @tobiu closed this issue

