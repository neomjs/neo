---
id: 1474
title: separate the webpack based split chunks into 1 folder for each thread
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-12-03T21:47:19Z'
updatedAt: '2020-12-03T21:50:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1474'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-12-03T21:50:40Z'
---
# separate the webpack based split chunks into 1 folder for each thread

in some rare edge cases, webpack can create the same chunk file names for modules inside the main & app thread.

e.g.:

<img width="1212" alt="Screenshot 2020-12-03 at 22 29 58" src="https://user-images.githubusercontent.com/1177434/101092046-51a63100-35b9-11eb-829c-65082f7a172b.png">

<img width="1275" alt="Screenshot 2020-12-03 at 22 31 39" src="https://user-images.githubusercontent.com/1177434/101092064-57037b80-35b9-11eb-9b0c-cad69dd4adcd.png">

294 will override the other version, resulting in a corrupted output for the prod env.

i will add folders like

chunks/app/*
chunks/main/*

to resolve this. 

## Timeline

- 2020-12-03T21:47:19Z @tobiu added the `enhancement` label
- 2020-12-03T21:47:19Z @tobiu assigned to @tobiu
- 2020-12-03T21:49:01Z @tobiu referenced in commit `7db5b22` - "separate the webpack based split chunks into 1 folder for each thread #1474"
- 2020-12-03T21:50:05Z @tobiu referenced in commit `c5b3ff3` - "#1474 removed the not realted drag zone testing logs"
- 2020-12-03T21:50:40Z @tobiu closed this issue

