---
id: 150
title: Real world app does not load in chrome 78.0.3904.108  mac OS
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2019-12-06T07:37:31Z'
updatedAt: '2019-12-06T10:47:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/150'
author: prakashsvmx
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2019-12-06T10:08:09Z'
---
# Real world app does not load in chrome 78.0.3904.108  mac OS

**Describe the bug**
Real world app does not load.

```
Uncaught TypeError: Failed to construct 'Worker': Module scripts are not supported on DedicatedWorker yet. You can try the feature with '--enable-experimental-web-platform-features' flag (see https://crbug.com/680046)
    at Manager.createWorker (Manager.mjs:164)
    at Manager.mjs:145
    at Array.forEach (<anonymous>)
    at Manager.createWorkers (Manager.mjs:144)
    at new Manager (Manager.mjs:85)
    at Object.create (Neo.mjs:321)
    at Manager.mjs:338
Base.mjs:231 Uncaught TypeError: Cannot read property 'sendMessage' of undefined
    at Base.mjs:231
    at Array.forEach (<anonymous>)
    at DomAccess.initRemote (Base.mjs:227)
Base.mjs:231 Uncaught TypeError: Cannot read property 'sendMessage' of undefined
    at Base.mjs:231
    at Array.forEach (<anonymous>)
    at DomEvents.initRemote (Base.mjs:227)
DomEvents.mjs:530 Uncaught TypeError: Cannot read property 'sendMessage' of undefined
    at DomEvents.sendMessageToApp (DomEvents.mjs:530)
    at DomEvents.onKeyDown (DomEvents.mjs:371)
```

**To Reproduce**
Steps to reproduce the behavior:
Launch the example app: [Realworld App](https://neomjs.github.io/pages/node_modules/neo.mjs/apps/realworld/index.html)

**Expected behavior**
It should load or graceful error/fallback should be displayed.

**Screenshots**

**Desktop (please complete the following information):**
 - OS: MacOS
 - Browser Chrome
 - Version 78.0.3904.108



## Timeline

- 2019-12-06T07:37:31Z @prakashsvmx added the `bug` label
### @tobiu - 2019-12-06T09:11:10Z

Hi prakashsvmx, welcome to the neo.mjs community!

We could indeed add a check if the Chrome version is < 80.

It already does work in Chrome Canary and will work in Chrome at some point in January without using the Chrome flag. This is why I always highlight to use the flag.

The dist versions also work fine without using a flag (also work in FF & Safari).

I am not sure if it is possible to solve this in a more feature-detection oriented way. I will give it a shot spawning a worker inside a try - catch block.

Best regards
Tobias

### @tobiu - 2019-12-06T09:17:55Z

related to #143 & #101

- 2019-12-06T10:03:37Z @tobiu referenced in commit `3122974` - "Real world app does not load in chrome 78.0.3904.108 mac OS #150"
### @tobiu - 2019-12-06T10:08:09Z

Chrome no longer throws an error and the exception will get logged to the doc.body instead.

![Screenshot 2019-12-06 at 11 03 04](https://user-images.githubusercontent.com/1177434/70314804-7f2a9400-1818-11ea-8894-32b336c69630.png)

However, this does not affect FF & Safari, since they don't throw an error in case the worker creation fails.

Closing this ticket and sticking to #143.

The change will get deployed to gh-pages in v1.0.9.

- 2019-12-06T10:08:09Z @tobiu closed this issue

