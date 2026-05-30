---
id: 1807
title: remove the fibers dependency again
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-16T15:07:13Z'
updatedAt: '2021-04-16T15:09:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1807'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-16T15:09:49Z'
---
# remove the fibers dependency again

although it works fine locally, it does break for `npx neo-app`.
most likely a different node version inside this scope.

<img width="1085" alt="Screenshot 2021-04-16 at 16 38 56" src="https://user-images.githubusercontent.com/1177434/115044681-050f2280-9ed6-11eb-90cc-07781f959dd2.png">

although the `sass-loader` projects recommends using fibers, i just looked at the project repo and it won't work with node v16+

![Screenshot 2021-04-16 at 17 04 38](https://user-images.githubusercontent.com/1177434/115044799-2708a500-9ed6-11eb-92cf-e3098bd50c2f.png)

https://github.com/laverdet/node-fibers

## Timeline

- 2021-04-16T15:07:13Z @tobiu added the `enhancement` label
- 2021-04-16T15:07:14Z @tobiu assigned to @tobiu
- 2021-04-16T15:09:00Z @tobiu referenced in commit `39df686` - "remove the fibers dependency again #1807"
### @tobiu - 2021-04-16T15:09:49Z

of course you can still manually add fibers into your neo.mjs workspace package.json.

- 2021-04-16T15:09:49Z @tobiu closed this issue

