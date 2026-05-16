---
id: 4140
title: Lazy loaded forms are acting differently in dist/production
state: CLOSED
labels:
  - bug
  - help wanted
  - stale
assignees: []
createdAt: '2023-02-23T15:56:38Z'
updatedAt: '2024-09-12T02:29:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4140'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:28Z'
---
# Lazy loaded forms are acting differently in dist/production

Inside the dev mode:
https://neomjs.github.io/pages/node_modules/neo.mjs/apps/form/

clicking the "validate all pages" button will fetch the missing modules in parallel:
<img width="835" alt="Screenshot 2023-02-23 at 16 33 44" src="https://user-images.githubusercontent.com/1177434/220959799-50e0d0b2-da46-4076-abeb-1d4e7521bf56.png">

inside the webpack based output, they do get fetched one by one:
https://neomjs.github.io/pages/node_modules/neo.mjs/dist/production/apps/form/

<img width="909" alt="Screenshot 2023-02-23 at 16 33 55" src="https://user-images.githubusercontent.com/1177434/220959960-f450b914-4c61-4ec4-b972-cc559f0f2b77.png">

not sure yet, if i am using `Promise.all()` in a way which webpack does not understand or if this might be a bug. sadly i am super short on time with my neo client-project MVP getting close. so, any help is appreciated :)

the related code is here:
https://github.com/neomjs/neo/blob/dev/src/form/Container.mjs#L146

which triggers:
https://github.com/neomjs/neo/blob/dev/src/layout/Card.mjs#L173

@sokra


## Timeline

- 2023-02-23T15:56:39Z @tobiu added the `bug` label
- 2023-02-23T15:56:39Z @tobiu added the `help wanted` label
### @github-actions - 2024-08-29T02:27:31Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:32Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:28Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:28Z @github-actions closed this issue

