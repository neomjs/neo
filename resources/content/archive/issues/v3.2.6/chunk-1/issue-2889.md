---
id: 2889
title: Follow Selection jumps arround instead of smooth scrolling
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2022-02-23T15:53:54Z'
updatedAt: '2022-02-24T21:10:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2889'
author: mauriciogracia
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-02-24T21:10:07Z'
---
# Follow Selection jumps arround instead of smooth scrolling

While looking around https://neomjs.github.io/pages/node_modules/neo.mjs/dist/production/examples/component/coronaHelix/index.html and using the FollowSelection option 

when I move the arrow, the selection moves to next/previous card and then the cards are scrolled and seems like two changes when is not the case

An intermediate animation of the cards when scrolling will make the change/animation more smooth, without the selection jumping from one card to the other.



## Timeline

- 2022-02-23T15:53:54Z @mauriciogracia added the `enhancement` label
- 2022-02-24T20:43:30Z @tobiu referenced in commit `0971822` - "Follow Selection jumps arround instead of smooth scrolling #2889"
### @tobiu - 2022-02-24T21:10:07Z

deployed the change to the online examples. enjoy.

- 2022-02-24T21:10:08Z @tobiu closed this issue

