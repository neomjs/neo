---
id: 6000
title: 'Hacktoberfest: Storybook integration for Neo.mjs'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - hacktoberfest
assignees: []
createdAt: '2024-10-01T22:52:24Z'
updatedAt: '2024-11-02T13:00:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6000'
author: tobiu
commentsCount: 1
parentIssue: 5963
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-02T13:00:50Z'
---
# Hacktoberfest: Storybook integration for Neo.mjs

Related to the Hacktoberfest Welcome ticket: https://github.com/neomjs/neo/issues/5963 (Please read this ticket first)

Creating a new ticket for the Neo.mjs Storybook integration for the hacktoberfest event.

This topic is rather complex and needs in-depth Storybook knowledge.

Related tickets:
https://github.com/neomjs/neo/issues/5010
https://github.com/neomjs/neo/issues/5132
https://github.com/neomjs/neo/issues/5133
https://github.com/neomjs/neo/issues/5134

Unfortunately, I will not find time for this in the near future (focussing on framework core tasks), but it would be super nice for designers and other Storybook fans to be able to render neo components inside Storybook.

We already created the framework logic to enable us to create & update neo components from inside the main thread (normally, the app worker is fully in charge). This was needed for the Siesta based component testing.

In case someone has the skills and would like to work on this epic, please let me know.

It would obviously be worth a lot of PRs. The "Storybook framework" and the custom "renderer" (I can help on this one) are the tricky parts.

If we can get to the point where we render a first button inside Storybook, we can create separate PRs for every single additionally added component.

## Timeline

- 2024-10-01T22:52:24Z @tobiu added the `enhancement` label
- 2024-10-01T22:52:24Z @tobiu added the `help wanted` label
- 2024-10-01T22:52:24Z @tobiu added the `hacktoberfest` label
### @tobiu - 2024-11-02T13:00:50Z

Since the event has ended, i will close all hacktoberfest related tickets now. In case someone still wants to work on a related ticket, feel free to add a comment and we can reopen it.

- 2024-11-02T13:00:50Z @tobiu closed this issue

