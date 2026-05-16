---
id: 1070
title: 'Responsive Components: switch all theme CSS rules from px to em'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - stale
assignees: []
createdAt: '2020-08-14T20:55:23Z'
updatedAt: '2024-09-27T02:34:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1070'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-27T02:34:33Z'
---
# Responsive Components: switch all theme CSS rules from px to em

strategy: we need to start with font-sizes, since the base unit (font-size) should be 16px for all components.

afterwards: 1em == 16px => convert the values.

exception: borders need to stay px based.

a pretty big, but trivial ticket. we should split it up as needed.

i will probably refactor component.DateSelector very soon.

## Timeline

- 2020-08-14T20:55:23Z @tobiu added the `enhancement` label
- 2020-08-14T20:55:23Z @tobiu added the `help wanted` label
- 2020-08-14T20:55:23Z @tobiu added the `good first issue` label
### @TatisLois - 2020-10-01T17:26:59Z

Hey @tobiu seems like a straightforward but tedious task, probably a great candidate to get familiar with the codebase. 

Is this something I can take up? :) 

### @tobiu - 2020-10-01T18:27:00Z

Welcome @TatisLois,

to get familiar with the code base, I recommend to take a look at the 2 covid app tutorials first:

https://neomjs.github.io/pages/node_modules/neo.mjs/dist/production/apps/website/index.html#mainview=blog

=> https://medium.com/swlh/how-to-create-a-webworkers-driven-multithreading-app-part-1-fa0cc78a4237?source=friends_link&sk=a10ca85002f5f9c3ee8c69f53c79d95f

Of course, help on this ticket is greatly appreciated. I would create new related tickets to keep it reasonable, e.g. button.Base: em based styling.

I am working on drag&drop support for lists & tree lists next, since I need this one for a client project.

Best regards,
Tobias

### @github-actions - 2024-09-13T02:31:20Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-13T02:31:21Z @github-actions added the `stale` label
### @github-actions - 2024-09-27T02:34:32Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-27T02:34:33Z @github-actions closed this issue

