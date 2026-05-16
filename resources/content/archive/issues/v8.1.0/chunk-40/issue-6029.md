---
id: 6029
title: 'Component Tests: Button'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - Mialy333
createdAt: '2024-10-13T16:13:07Z'
updatedAt: '2024-11-02T12:58:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6029'
author: tobiu
commentsCount: 4
parentIssue: 6001
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-02T12:58:05Z'
---
# Component Tests: Button

We already have a starting point:
https://github.com/neomjs/neo/tree/dev/test/components/files/button

This can get extended to test more config options, especially changing configs at run-time.

Some configs which are worth to get tested:
1. text
2. iconCls
3. iconPosition
4. badgeText
5. badgePosition
6. route

## Timeline

- 2024-10-13T16:13:07Z @tobiu added the `enhancement` label
- 2024-10-13T16:13:07Z @tobiu added the `good first issue` label
- 2024-10-13T16:13:07Z @tobiu added the `hacktoberfest` label
- 2024-10-13T16:13:07Z @tobiu added the `help wanted` label
- 2024-10-13T16:16:08Z @tobiu cross-referenced by #5963
### @Mialy333 - 2024-10-13T18:09:33Z

Hi 👋🏽
Could you please assign me to this task? I'm already working on it. Thanks ! 
Best,
Mialy 

- 2024-10-13T18:43:22Z @tobiu assigned to @Mialy333
### @tobiu - 2024-10-13T18:48:38Z

now i can => it does require a comment inside the same ticket, otherwise devs do not show up inside the assignees list.

some background infos:
* the apps & components which we want to test live within the app worker
* the testing tool (siesta) runs inside the main thread
* since there are no testing tools yet which can run inside a web worker, we do need async helper methods to create or modify neo instances from within the main thread.

if you want to get a better understanding how you would normally build apps:
https://neomjs.com/dist/production/apps/portal/#/learn/tutorials.Earthquakes

best regards,
tobi

### @SarthakBorude - 2024-10-30T19:22:30Z

/assign


### @tobiu - 2024-11-02T12:58:05Z

Since the event has ended, i will close all hacktoberfest related tickets now. In case someone still wants to work on a related ticket, feel free to add a comment and we can reopen it.

- 2024-11-02T12:58:06Z @tobiu closed this issue

