---
id: 1804
title: update the sass-loader dependency to v11
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-16T14:01:31Z'
updatedAt: '2021-04-16T14:21:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1804'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-16T14:21:22Z'
---
# update the sass-loader dependency to v11

for some reason `npm update` keeps this package at v10 although v11 is out there.

v10 still logs warnings for `node-sass` dependencies, v11 can support (dart-)sass in a better way:
https://www.npmjs.com/package/sass-loader

<img width="1057" alt="Screenshot 2021-04-16 at 15 48 25" src="https://user-images.githubusercontent.com/1177434/115035559-fb34f180-9ecc-11eb-9f01-2ee52707323b.png">


## Timeline

- 2021-04-16T14:01:31Z @tobiu added the `enhancement` label
- 2021-04-16T14:01:31Z @tobiu assigned to @tobiu
- 2021-04-16T14:10:57Z @tobiu referenced in commit `f53d68c` - "update the sass-loader dependency to v11 #1804"
### @tobiu - 2021-04-16T14:15:18Z

![Screenshot 2021-04-16 at 16 11 41](https://user-images.githubusercontent.com/1177434/115037601-ece7d500-9ece-11eb-993d-d02c68aaf94b.png)


- 2021-04-16T14:15:51Z @tobiu referenced in commit `f26a429` - "#1804 adding the fibers package"
- 2021-04-16T14:21:22Z @tobiu closed this issue

