---
id: 191
title: 'Safari: Worker should support ES6 modules'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
assignees: []
createdAt: '2019-12-20T20:58:41Z'
updatedAt: '2024-08-31T08:55:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/191'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-31T08:55:14Z'
---
# Safari: Worker should support ES6 modules

Hi everyone,

in case you would like to use the neo.mjs non build mode in Safari as well,
this is the reason why it does not work:

https://bugs.webkit.org/show_bug.cgi?id=164860

So far this ticket has way too little attention. In case you do care about Safari, please add some weight there.

Best regards
Tobias

## Timeline

- 2019-12-20T20:58:41Z @tobiu added the `enhancement` label
- 2019-12-20T20:58:41Z @tobiu added the `help wanted` label
- 2019-12-20T20:58:41Z @tobiu added the `good first issue` label
- 2019-12-20T21:36:44Z @tobiu changed title from **Safari: support for worker type="module"** to **Safari: Worker should support ES6 modules**
- 2020-11-11T10:28:48Z @tobiu cross-referenced by #1431
### @tobiu - 2021-04-26T00:55:39Z

it works perfectly fine inside the nightly build now.
will keep the ticket open until it hits the normal version.

### @tobiu - 2024-08-31T08:55:14Z

works fine at this point.

- 2024-08-31T08:55:14Z @tobiu closed this issue

