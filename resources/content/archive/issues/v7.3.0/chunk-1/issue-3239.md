---
id: 3239
title: Update Documentation - 3 Tabs instead of one - Demo Apps and User Apps and API
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2022-06-30T16:40:45Z'
updatedAt: '2024-09-13T02:30:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3239'
author: Dinkh
commentsCount: 5
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:30:21Z'
---
# Update Documentation - 3 Tabs instead of one - Demo Apps and User Apps and API

Demo Apps (e.g. Helix) should not be part of the ´API´ documentation, but be added to ´Examples´.

The user Apps should be inside a tab ´Apps´.

Currently all Apps are part of the API documentation

## Timeline

- 2022-06-30T16:40:46Z @Dinkh added the `enhancement` label
### @tobiu - 2022-06-30T18:08:42Z

be careful with mentioning examples in this context. right now the structure of the 3 tabs is:

1. API
2. Tutorials
3. Examples (demo apps loaded into the docs app)

so, we could split the first tab into API src and API apps.

inside the framework docs, we do show all apps (API) of the framework (until we adjust the GitHub pages to be able to pull them in from different repos).

inside the workspace docs, we do show all self created apps (API).

Adding the API of examples is possible (new ticket though).

### @Dinkh - 2022-07-01T07:58:59Z

Is it possible to remove the Demo Apps from the Workspace build process, so that we get a clean setup?
I like the idea of having these example (Helix...) but I would prefer not to build them in my professional setting.

### @tobiu - 2022-07-01T08:05:58Z

workspace build process: node_modules should be excluded from split chunks. at least on MacOS this is the case. you can easily verify if it is the same on windows with searching for demo app class names inside `dist/production/chunks/app`.

the docs app parser `buildScripts/docs/jsdocx.mjs` will include the apps for the neo and workspace scope. removing framework apps for this scope is definitely possible (new ticket please).

### @github-actions - 2024-08-30T02:28:08Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:28:08Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:30:21Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:30:21Z @github-actions closed this issue

