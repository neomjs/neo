---
id: 738
title: 'SharedCovid App: dist versions'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-15T14:31:04Z'
updatedAt: '2020-09-16T21:22:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/738'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-09-16T21:22:25Z'
---
# SharedCovid App: dist versions

this one is actually a problem.

we can not use the current webpack configuration for this use case.

buildScripts/webpack/entrypoints/myApps/SharedCovid.mjs
```
import '../../../../src/worker/App.mjs';
import '../../../../apps/sharedcovid/app.mjs';
```

buildScripts/webpack/entrypoints/myApps/SharedCovidChart.mjs
```
import '../../../../src/worker/App.mjs';
import '../../../../apps/sharedcovid_chart/app.mjs';
```

while this way is fine for non shared workers (to ensure webpack does not create duplicate files for framework related classes), it can not work for the SharedWorkers context:

we will get 1 separate SW per app and not all shared covid apps connecting to the same SW instance as it works inside the dev mode.

it looks like we have to finish the chunk splitting in a more advanced way for the App worker context, before we can publish a new version containing the shared covid app.

![Screenshot 2020-06-15 at 09 03 42](https://user-images.githubusercontent.com/1177434/84669800-9368ef80-af25-11ea-9383-bed55f540dcb.png)


## Timeline

- 2020-06-15T14:31:04Z @tobiu added the `enhancement` label
- 2020-06-15T14:31:04Z @tobiu assigned to @tobiu
### @tobiu - 2020-06-16T09:47:33Z

Created a webpack feature request ticket:
https://github.com/webpack/webpack/issues/11049

Copying the content here to keep you in the loop.

<!-- Please don't delete this template or we'll close your issue -->

## Feature request
I am not 100% sure if this still fits the scope of the webpack project.

I am working on the topic "Expanding Single Page Apps into multiple Browser Windows", which can look like this:
![Screenshot 2020-06-15 at 09 03 42](https://user-images.githubusercontent.com/1177434/84753491-58b39580-afbf-11ea-83f4-fcd3b17bd768.png)

Quick background info:
Apps we create using neo.mjs just import the main thread. The main thread creates the app, data & vdom workers. The only important part here is the app worker: you define which app (entrypoint) you want to use and the app worker dynamically imports it.

For the dist versions which rely on webpack, webpack has no chance to know what could get imported, so I created build specific entrypoints.
Example:
https://github.com/neomjs/neo/blob/master/buildScripts/webpack/entrypoints/myApps/Covid.mjs
```
import '../../../../src/worker/App.mjs';
import '../../../../apps/covid/app.mjs';
```

This cheating a little bit, since inside the dist versions, the import is no longer dynamic.
Works fine though.

Now for the multi Browser Window apps, i needed to switch the App (,Data & VDom) workers into SharedWorkers.
It does work fine using webpack based builds as long as you use only 1 app:

Online Demo: https://neomjs.github.io/pages/node_modules/neo.mjs/dist/development/apps/sharedcovid/index.html#mainview=table

More background infos:
https://medium.com/swlh/neo-mjs-v1-2-5-support-for-sharedworkers-including-firefox-b31f144cea3f?source=friends_link&sk=6bd4d0beb0e095c388153ce8f06aa76f 

I got a version using multiple Apps running directly inside Chrome (using JS modules inside the browser) and it would be nice if it would be possible to achieve the same result with a webpack based build.

Now this is the tricky part:

SharedWorkers **have** to use the same file as an entry point (otherwise the browser will spawn new SW instances, which makes using them pointless).

To make this happen, we need to use separate webpack based builds (Shared AppWorker VS apps), which can work in combination.

<!-- Issues which contain questions or support requests will be closed. -->
<!-- Before creating an issue please make sure you are using the latest version of webpack. -->
<!-- Check if this feature need to be implemented in a plugin or loader instead -->
<!-- If yes: file the issue on the plugin/loader repo -->
<!-- Features related to the development server should be filed on this repo instead -->

**What is the expected behavior?**
https://www.youtube.com/watch?v=RslY-e-f_qc

It would be nice if this app could run the same way it does in dev mode (without any builds).

**What is motivation or use case for adding/changing the behavior?**
SharedWorkers are a big deal, even the webkit team is finally thinking about supporting them:
https://bugs.webkit.org/show_bug.cgi?id=149850

This has a big potential to improve the way, UI development works in general.

**How should this be implemented in your opinion?**
I have been thinking about this quite a bit.

For the neo.mjs context, we should create a separate webpack based build just for sharedthe app worker (not including apps).

Then, to build apps, we need separate builds (entry points for builds).

I was thinking about something like:
```
import '../../../../src/worker/App.mjs';

import(/* webpackChunkName: 'apps/sharedcovid/app' */       '../../../../apps/sharedcovid/app.mjs');
import(/* webpackChunkName: 'apps/sharedcovid_chart/app' */ '../../../../apps/sharedcovid_chart/app.mjs');
import(/* webpackChunkName: 'apps/sharedcovid_helix/app' */ '../../../../apps/sharedcovid_helix/app.mjs');
import(/* webpackChunkName: 'apps/sharedcovid_map/app' */ '../../../../apps/sharedcovid_map/app.mjs');
```

This way, the app worker will get parsed as well for each app build to ensure that we don't duplicate modules inside the app worker and apps (especially duplicating the IdGenerator would break a lot).

We can adjust output: {filename: chunkData => {}}

to save the app worker output itself for an app build into a not used dummy chunk (e.g. 0.js or tmp.js).

we can use split chunks for app related code this way (multiple dynamic imports which are supposed to not duplicate code).

I tried this approach, but am getting errors. E.g. since we are not using the "real" entry point, the build app worker output is not able to pick up the app chunks (__webpack_require__.e is undefined, since the separate app worker output is no longer exposing dynamic imports to webpack). 

**Are you willing to work on this yourself?**
I don't have much time at the moment (still polishing the content of the first shared workers demo to expand SPAs into multiple browser windows), but am willing to help a bit and can definitely provide more input if needed.

### @tobiu - 2020-09-16T21:22:25Z

resolved with v1.4.

- 2020-09-16T21:22:25Z @tobiu closed this issue

