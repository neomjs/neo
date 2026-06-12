---
id: 6001
title: 'Hacktoberfest: Creating more component tests'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees: []
createdAt: '2024-10-01T23:05:45Z'
updatedAt: '2024-11-02T13:00:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6001'
author: tobiu
commentsCount: 1
parentIssue: 5963
subIssues:
  - '[x] 6029 Component Tests: Button'
subIssuesCompleted: 1
subIssuesTotal: 1
blockedBy: []
blocking: []
closedAt: '2024-11-02T13:00:39Z'
---
# Hacktoberfest: Creating more component tests

Related to the Hacktoberfest Welcome ticket: https://github.com/neomjs/neo/issues/5963 (Please read this ticket first)

This is a shout-out to all `automated Testers` out there.

We already started to write unit tests for the vdom engine, collections and the custom class config system:
https://github.com/neomjs/neo/tree/dev/test/siesta/tests

We also created a couple of component tests using Siesta 5:
https://github.com/neomjs/neo/tree/dev/test/components

Nick @canonic-epicure, the creator of the Siesta Testing Tool, did create a PoC for Siesta 6:
https://github.com/neomjs/neo/tree/siesta6/test/siesta6 (all unit tests work)

Siesta v6 is a super nice project which is using PlayWright to generate headless browsers:
https://github.com/bryntum/siesta

The PoC for component based testing in v6 is still missing (we might need Nicks help on this one).

Inside the hacktoberfest scope, this would be worth a lot of PRs => at least one for each component (also, one for basic testing of one component and additional PRs for more advanced tests). As a follow-up, we could also automatically test examples & demo apps.

Please let me know, in case anyone is interested in writing more tests, especially for the component library. This would help us a lot with avoiding future regression bugs.


Thanks and best regards,
Tobi

## Timeline

- 2024-10-01T23:05:45Z @tobiu added the `help wanted` label
- 2024-10-01T23:05:45Z @tobiu added the `good first issue` label
- 2024-10-01T23:05:45Z @tobiu added the `hacktoberfest` label
- 2024-10-01T23:06:21Z @tobiu added the `enhancement` label
### @tobiu - 2024-11-02T13:00:40Z

Since the event has ended, i will close all hacktoberfest related tickets now. In case someone still wants to work on a related ticket, feel free to add a comment and we can reopen it.

- 2024-11-02T13:00:40Z @tobiu closed this issue

