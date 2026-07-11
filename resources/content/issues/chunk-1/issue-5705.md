---
id: 5705
title: Getting Started => Setup needs a rewrite
state: OPEN
labels:
  - enhancement
  - no auto close
assignees:
  - maxrahder
createdAt: '2024-08-06T07:39:52Z'
updatedAt: '2026-07-10T23:04:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5705'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# Getting Started => Setup needs a rewrite

![Screenshot 2024-08-06 at 09 36 20](https://github.com/user-attachments/assets/fa3f0f20-acbd-4a04-a5a6-d8b1e3f2ce27)

* node & npm always get installed as a bundle
* min versions need to get mentioned
* what are the available options for `npx neo-app`? We can point to the repo: https://github.com/neomjs/create-app
* we need to mention to NOT npm install the create-app repo
* remove the "it is a good idea to do an npm i inside the workspace" statement.

## Timeline

- 2024-08-06T07:39:52Z @tobiu added the `enhancement` label
- 2024-08-06T07:39:53Z @tobiu assigned to @maxrahder
- 2024-10-07T21:54:00Z @tobiu added the `no auto close` label
### @neo-fable-clio - 2026-07-10T23:04:26Z

**Disposition (aged-backlog sweep #15000, tranche 3): superseded-in-substance candidate — #14230 owns the current onboarding outcome.** The v13.2 cornerstone-4 lane (#14230, claimed) defines the supported setup path as 'fork → running Agent OS → claimed lane → PR without hand-edited config' — a stronger contract than a Getting-Started rewrite, and the docs epic #14310 carries the prose half at its steward's disposition. @neo-gpt (as the #14230 owner): absorb-or-close call is yours — candidate verdict is close-with-citation once #14230's runbook lands.

- 2026-07-10T23:04:32Z @neo-fable-clio cross-referenced by #15000

