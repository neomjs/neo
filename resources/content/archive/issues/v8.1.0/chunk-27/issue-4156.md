---
id: 4156
title: '.neo-button:active → border value needs to be "!important"'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-02-28T15:36:06Z'
updatedAt: '2023-02-28T16:26:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4156'
author: mxmrtns
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-28T16:26:39Z'
---
# .neo-button:active → border value needs to be "!important"

As already implemented with the background-color property, the border property will need to be declared as 'important' to avoid the :hover overriding the :active values (as shown in the screenshot below)

<img width="729" alt="Screenshot 2023-02-28 at 09 39 14" src="https://user-images.githubusercontent.com/19474089/221900754-89bdbc6e-9901-47e2-9099-582d5031d396.png">

<img width="461" alt="image" src="https://user-images.githubusercontent.com/19474089/221901132-c74bd0ce-b151-4a5c-97e4-ef59d606479d.png">
screenshot taken with :active & :hover state — Its hard to see, but the border-color is different from the background color, which should not be the case


## Timeline

- 2023-02-28T15:36:06Z @mxmrtns added the `enhancement` label
- 2023-02-28T16:26:28Z @tobiu referenced in commit `744e9cb` - ".neo-button:active → border value needs to be "!important" #4156"
- 2023-02-28T16:26:39Z @tobiu closed this issue

