---
id: 1228
title: Add support for public class fields
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-09-29T12:38:41Z'
updatedAt: '2021-04-25T08:58:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1228'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-25T08:58:29Z'
---
# Add support for public class fields

Public class fields are a stage3 proposal for a very long time already:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Public_class_fields

If you look close at the browser support, safari did catch up and this looks reasonable to use at this point. The only exception is Firefox for Android, which we can ignore.

With added support for class fields, we can move all configs without a trailing underscore into the class body directly (e.g. className or ntype).

The only downside is, that webpack is not able to build stage3 proposals:
https://github.com/webpack/webpack/issues/10216

More precisely: the internal parser (Acorn) needs to get adjusted, which is not possible using webpack based configs.

<img width="1355" alt="Screenshot 2020-09-29 at 14 22 37" src="https://user-images.githubusercontent.com/1177434/94558611-5fa99f80-0260-11eb-8d5f-e50542d4b0ae.png">

To add support for all (...) stage3 proposals, we could adjust the package.json and add a resolutions prop:
https://github.com/OnurGvnc/acorn-with-stage3

This one only works with yarn. To make it work with npm, we also need to add:
https://github.com/rogeriochaves/npm-force-resolutions

It feels worth a try. In case we get it working for neo, we could probably get rid of the trailing underscore for configs completely (a breaking change).

## Timeline

- 2020-09-29T12:38:41Z @tobiu added the `enhancement` label
### @tobiu - 2021-04-25T08:58:29Z

we can now do this:
https://github.com/webpack/webpack/issues/10216#issuecomment-826144064

- 2021-04-25T08:58:29Z @tobiu closed this issue

