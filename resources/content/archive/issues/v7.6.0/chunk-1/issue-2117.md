---
id: 2117
title: Textarea field resize should be anchored to top/left
state: CLOSED
labels:
  - enhancement
  - good first issue
  - stale
assignees: []
createdAt: '2021-05-22T20:18:44Z'
updatedAt: '2024-09-16T02:37:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2117'
author: keckeroo
commentsCount: 5
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-16T02:37:05Z'
---
# Textarea field resize should be anchored to top/left

**Describe the bug**
When resizing textarea field, it appears that this will grow in height in BOTH directions as the resize icon is dragged. This can lead to input area affecting items above it (shoving up) and well as the input itself going above the screen and out of view

As well - the border separating the clearable icon has a gap when resizing 

**To Reproduce**
Steps to reproduce the behavior:
1. Go to textarea example
2. Click on resize and drag icon to resize

**Expected behavior**
The drag should be creating a bottom/right anchor for the the input area and not affect the top/left position
![Screen Shot 2021-05-22 at 3 15 01 PM](https://user-images.githubusercontent.com/1653769/119239786-f5a47a00-bb10-11eb-9132-f33934cba3ba.png)
![Screen Shot 2021-05-22 at 3 15 20 PM](https://user-images.githubusercontent.com/1653769/119239793-fc32f180-bb10-11eb-88a2-3de85831fa35.png)


## Timeline

- 2021-05-22T20:18:44Z @keckeroo added the `bug` label
### @tobiu - 2021-05-23T09:29:55Z

Changing this one to a feature request.

My labeling strategy:
Is a feature implemented but does not work? => bug
Is it not implemented yet? => enhancement (feature request)

You are welcome to work on this one :)

- 2021-05-23T09:30:19Z @tobiu removed the `bug` label
- 2021-05-23T09:30:19Z @tobiu added the `enhancement` label
- 2021-05-23T09:30:19Z @tobiu added the `good first issue` label
### @shilpeePrasad - 2021-06-20T07:47:28Z

Hi, I would like to work on this issue. Thanks

### @tobiu - 2021-06-20T08:04:10Z

Appreciated! Feel free to join the Slack Channel in case you need help getting up to speed with neo.

### @github-actions - 2024-09-02T02:30:20Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-02T02:30:21Z @github-actions added the `stale` label
### @github-actions - 2024-09-16T02:37:05Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-16T02:37:05Z @github-actions closed this issue

