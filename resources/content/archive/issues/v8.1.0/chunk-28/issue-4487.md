---
id: 4487
title: Cypress configuration into Neo
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-05-30T06:37:49Z'
updatedAt: '2024-09-13T02:30:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4487'
author: subramaniyamP
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:59Z'
---
# Cypress configuration into Neo

**Is your feature request related to a problem? Please describe.**
A clear and concise description of what the problem is. Ex. I'm always frustrated when [...]

**Describe the solution you'd like**
in configuration of neo framework for component testing in cypress. we need to integrate cypress with our neo app.

**Describe alternatives you've considered**
Able to run E2E but component testing in cypress.

**Additional context**
Add any other context or screenshots about the feature request here.


## Timeline

- 2023-05-30T06:37:49Z @subramaniyamP added the `enhancement` label
- 2023-06-07T14:12:19Z @tobiu referenced in commit `ef8f4a9` - "#4487 added cypress as a dev dependency"
### @tobiu - 2023-06-07T15:13:06Z

@subramaniyamP first version of the framework definition:
https://github.com/neomjs/cypress-ct-neo.mjs

the mount() logic is not yet implemented.

no clue yet if cypress will insist on using webpack. neo does not need it for our dev mode.

### @tobiu - 2023-06-12T10:49:24Z

cross reference ticket: https://github.com/cypress-io/cypress/issues/27002

### @github-actions - 2024-08-29T02:27:19Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:20Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:59Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:59Z @github-actions closed this issue

