---
id: 238
title: Any Performance Benchmarks?
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2020-02-06T15:10:03Z'
updatedAt: '2024-09-28T02:32:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/238'
author: ryansolid
commentsCount: 6
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-28T02:32:27Z'
---
# Any Performance Benchmarks?

This seems like a very interesting approach that seems very beneficial in theory. Are there any performance benchmarks were it can be directly compared to other libraries. Maybe something like the [JS Framework Benchmark](https://github.com/krausest/js-framework-benchmark)? Obviously easier after Chrome 80 lands and I'm unsure if there would be any difficulty in measuring timing. But I'd definitely interested to see how an approach like this fairs.

So far all I have are lighthouse audits on the Realworld Demo where neo performs significantly better with the webpack build compared to the Chrome 80 version. Is there a better benchmark to show the performance benefits of this approach?


## Timeline

- 2020-02-06T15:10:03Z @ryansolid added the `enhancement` label
### @tobiu - 2020-02-20T21:21:46Z

Hi Ryan,

sorry for the late reply, the last weeks were intense. I did not take the time yet to create benchmarks comparing neo.mjs with other frameworks. For this framework it is tricky in general to compare the performance in good ways.

Some thoughts in general:
1. Rendering performance: the initial rendering of an app might be a bit slower compared to lightweight libraries / frameworks, since the worker setup requires some extra files / overhead. It should not be too bad though, since the framework only imports / builds the classes which are in use.
2. Idle main thread: UIs using animations can get flickering or even freeze in case there is a lot going on on the JS side. Also hard to test (maybe with creating some JS dummy "noise").
3. Where neo.mjs really shines is in creating complex components which can trigger lots of dom updates in parallel. The most impressive performance demo so far is most likely this one: https://neomjs.github.io/pages/node_modules/neo.mjs/examples/component/helix/index.html. The helix is using 300 div nodes and using the rotate slider (or scrolling horizontally on a trackpad / magic mouse) can easily trigger 30.000+ dom manipulations per second.
4. I am not 100% sure about the vdom worker. We could execute the logic inside the app thread instead (or make it optional). This one will only create big gains in case there is a lot going on inside the app thread (e.g. connected to web sockets with a big amount of updates).

Chrome 80 got released on Feb 4th, I think. It will take time though until other browsers catch up being able to render the non build versions. Chrome 81 will be exciting, since the neo-setup is almost there to switch to shared workers and create apps running inside multiple browser windows (screens).

Could you provide some input in which way the built realworld app version performs better?

Thanks & best regards
Tobias

### @ryansolid - 2020-02-21T04:31:36Z

I was just looking at lighthouse initial load performance in the audits tab of the chrome inspector. They measure a number of initial load metrics and score it overall. Nothing particularly granular. The scores were just higher for the webpack version under desktop and mobile. On my machine it was just over 10% difference.

To be fair, comparisons against other libraries probably are not even as interesting as comparing the webpack version versus the chrome 80 version. I was trying to understand the benefit of the approach. Like how much the overhead of the thread communication balances against the cost of main thread running the JS under different workloads.

I guess it has same sort of difficulty benchmarking as something like React Suspense. It isn't necessarily about raw performance but how it improves UI responsiveness.

### @tobiu - 2020-02-21T10:33:14Z

Ah ok. In case you want to compare initial loading times for the dev & build versions, the biggest difference are the amount of comments & blank chars inside the raw files.

"Native web packaging" => https://v8.dev/features/modules#web-packaging will resolve this on the long term.

For now, in case you would want a "real" comparison or to use the dev version in production apps (e.g. enforcing chrome or a native app (e.g. electron with a headless chromium)), it would make a lot of sense to add another build process to just minify each mjs file (e.g. closure compiler). Feel free to open a ticket for this one if needed.

Already in place is the feature, that browsers cache JS modules. Meaning: in case multiple files import the same modules, each module will only get loaded once. One good realworld example is the docs app: in the example tab, each example is an own neo.mjs app which will get lazy loaded once you want to render it. Obviously each app requires the same core modules inside the app thread. To achieve the same using webpack, you would need rockstar skills in this area to resolve the chunking & lazy loading (I gave up on this one for now).

Another difference is this one: `<link rel="modulepreload" href="main.mjs">`. Not in use yet, but it is possible to preload JS modules. Well, I need to think more on this one => if there is a way to get something similar working inside the worker scope.

Off topic: I improved the state management yesterday: https://medium.com/p/javascript-classes-state-management-87d66874ac8a?source=email-121c20a934c6--writer.postDistributed&sk=edd58364135a5848de3e10ac5b2a44d1



### @vadimpopa - 2022-08-31T09:23:25Z

Hi Tobiu,

I understand this framework has been influenced a lot by your past experience with Sencha and that you've taken an interesting approach with it. But as dev I would like to see some benchmarks too against current approaches used through libraries like React, Vue, SolidJs...and what makes this approach better than the rest, of course in the single page apps realm. The questions raised in this thread are still valid imo.

### @github-actions - 2024-09-14T02:28:07Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:28:08Z @github-actions added the `stale` label
### @github-actions - 2024-09-28T02:32:26Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-28T02:32:27Z @github-actions closed this issue

