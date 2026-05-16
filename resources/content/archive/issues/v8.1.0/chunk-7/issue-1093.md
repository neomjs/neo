---
id: 1093
title: cross repository actions / workflows => update the pages repo on release
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - stale
assignees: []
createdAt: '2020-08-17T14:40:55Z'
updatedAt: '2024-09-27T02:34:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1093'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-27T02:34:28Z'
---
# cross repository actions / workflows => update the pages repo on release

I flagged this one as a "good first issue", since it does not require any knowledge of neo.mjs itself.

Also flagged it as "help wanted", since actions & workflows are not a topic i am familiar with (well, setting up the auto npm publish one was easy).

Googled and found some input:

https://github.community/t/triggering-by-other-repository/16163

https://fabianmoronzirfas.me/tech/2019/02/06/cross-repo-github-action-triggering.html

https://github.com/drud/action-cross-commit

What I have in mind:

Once the github action to do an npm publish is done, the neomjs/pages repo needs to trigger an own action.

We could try `on: repository_dispatch` or use webhooks (similar to the discord use case to list all events).

Once we are able to get an event to start the action inside the pages repo, this one should run:

- npm update neo.mjs

- npm install

(basically follow the steps of the readme inside the pages repo)

at the end commit & push.

In case someone wants to help out on this one, I can create the required secrets.

Help on this one is definitely appreciated, since it can save me time (so I have more time to push the code base).

## Timeline

- 2020-08-17T14:40:55Z @tobiu added the `enhancement` label
- 2020-08-17T14:40:55Z @tobiu added the `help wanted` label
- 2020-08-17T14:40:55Z @tobiu added the `good first issue` label
### @github-actions - 2024-09-13T02:31:16Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-13T02:31:16Z @github-actions added the `stale` label
### @github-actions - 2024-09-27T02:34:28Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-27T02:34:28Z @github-actions closed this issue

