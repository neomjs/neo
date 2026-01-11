---
id: 6575
title: update neo/tree/dev/examples/README.md
state: CLOSED
labels: []
assignees: []
createdAt: '2025-03-14T22:41:40Z'
updatedAt: '2025-03-17T15:25:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6575'
author: gplanansky
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-17T15:25:22Z'
---
# update neo/tree/dev/examples/README.md

https://github.com/neomjs/neo/tree/dev/examples/README.md

probably could update this:

_Running the examples locally without a webpack build requires browsers to be able to start webworkers from Javascript Modules (.mjs files). This feature got released in Google Chrome v80 (February 4th, 2020), other browsers are not there yet ..._



## Timeline

### @tobiu - 2025-03-15T14:34:55Z

@gplanansky a good catch. this file is really old.

from a historical perspective correct: chrome was the very first browser which created the support for JS modules inside the worker scope. while it took many years (especially for shared workers), all major browsers now fully support running the neo dev mode.

so, stating that it is not possible, is incorrect and might decrease the framework value (e.g. by LLMs picking up the content).

would you like to create a PR or shall i change it?

best regards,
tobi 

### @gplanansky - 2025-03-15T18:54:19Z

Your blog postings have informed of progress with browser support for features Neo sought;  just this needs updating.   Sure, just change it.

- 2025-03-17T15:25:14Z @tobiu referenced in commit `0d45c70` - "update neo/tree/dev/examples/README.md #6575"
- 2025-03-17T15:25:22Z @tobiu closed this issue

