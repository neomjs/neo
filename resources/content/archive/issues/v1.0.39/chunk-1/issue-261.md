---
id: 261
title: Compatibility with NextJS-style website framework
state: CLOSED
labels:
  - QA
assignees: []
createdAt: '2020-03-09T15:03:41Z'
updatedAt: '2020-03-09T15:08:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/261'
author: chexxor
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-09T15:04:05Z'
---
# Compatibility with NextJS-style website framework

For future people who search for this question, logging the Q&A here for their benefit. Originally from: https://www.reddit.com/r/Frontend/comments/febrmh/contributors_wanted_multithreading_ui_framework/fjoglp2/

Question:

Is it possible to make a website framework like NextJS use this UI framework? The significant parts of NextJS is server-side rendering, page-reloading, and bundle-splitting/dynamic-loading a page's resources.

Response:

I am not familiar with NextJS, but in theory it could be.

Keep in mind that neo does need the JSON based vdom to dynamically change the DOM, so a server-side rendering would need to switch to its logic (or provide the vdom tree).

There is a middle-ware ticket open (no high prio though). In theory, we can enhance neo to work in a nodejs env. Then the app & vdom worker could optionally run on a BE to do server-side rendering, or combine server- & client side rendering.

For me personally, Chrome 81 with full support for shared workers is more interesting on the short term, since this will allow to create apps running inside multiple browser windows (multi screen apps).

## Timeline

- 2020-03-09T15:04:05Z @chexxor closed this issue
- 2020-03-09T15:08:58Z @tobiu added the `QA` label

