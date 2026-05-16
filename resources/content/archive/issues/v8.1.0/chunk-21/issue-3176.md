---
id: 3176
title: buildScripts/createClass
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-06-21T19:15:21Z'
updatedAt: '2022-06-21T22:25:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3176'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-21T22:25:01Z'
---
# buildScripts/createClass

I want to create a convenience CLI program, which simplifies creating new neo classes.

For the start, you should be able to pick between a base class of `component.Base` and `container.Base`.

There will be follow-up tickets, like extending view models and controllers.

## Timeline

- 2022-06-21T19:15:21Z @tobiu added the `enhancement` label
- 2022-06-21T19:15:21Z @tobiu assigned to @tobiu
- 2022-06-21T19:34:45Z @tobiu referenced in commit `3913a2a` - "buildScripts/createClass #3176: basic setup"
### @davhm - 2022-06-21T20:04:40Z

This sounds like a very valuable improvement! I also love the iterative approach thinking in small increments 👏 

- 2022-06-21T20:24:32Z @tobiu referenced in commit `4473b84` - "#3176: detect, if we are dealing with a Neo src or apps based class"
- 2022-06-21T20:35:12Z @tobiu referenced in commit `4d6e046` - "#3176: saving the class file within the app scope"
- 2022-06-21T21:00:56Z @tobiu referenced in commit `efd6b7d` - "#3176: basic output file"
### @tobiu - 2022-06-21T21:02:38Z

<img width="1105" alt="Screenshot 2022-06-21 at 23 01 23" src="https://user-images.githubusercontent.com/1177434/174896799-558c6af1-38c8-4971-a9cf-c20ca99c6741.png">

getting closer :)

- 2022-06-21T21:14:05Z @tobiu referenced in commit `be2328f` - "#3176: default import path fix"
- 2022-06-21T21:35:34Z @tobiu referenced in commit `873accc` - "#3176: adjusted the class content to better match component OR container.Base"
- 2022-06-21T21:47:48Z @tobiu referenced in commit `48d53b9` - "#3176: error for non-existing app names"
### @tobiu - 2022-06-21T21:48:28Z

<img width="862" alt="Screenshot 2022-06-21 at 23 47 59" src="https://user-images.githubusercontent.com/1177434/174902782-f9265645-9650-4a46-939a-442a4eea2af0.png">


- 2022-06-21T22:14:00Z @tobiu referenced in commit `c3e1f56` - "#3176: added a vdom config for component.Base extensions"
- 2022-06-21T22:21:30Z @tobiu referenced in commit `1aadcd6` - "#3176: dynamic folder levels for base class imports"
### @tobiu - 2022-06-21T22:25:01Z

created a decent state for the first version, more extensions will follow inside new tickets.

- 2022-06-21T22:25:01Z @tobiu closed this issue

