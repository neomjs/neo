---
id: 3268
title: Unit / integration tests
state: CLOSED
labels:
  - discussion
  - stale
assignees: []
createdAt: '2022-07-05T20:42:12Z'
updatedAt: '2024-09-13T02:30:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3268'
author: jzombie
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:30:09Z'
---
# Unit / integration tests

How are you testing the app?

## Timeline

- 2022-07-05T20:42:12Z @jzombie added the `enhancement` label
- 2022-07-06T06:48:16Z @tobiu removed the `enhancement` label
- 2022-07-06T06:48:16Z @tobiu added the `discussion` label
### @tobiu - 2022-07-06T07:29:58Z

Hi Jeremy,

let us differentiate between a neo app and the neo framework itself first.

On a current cloud based client project, we are using CI/CD pipelines. E.g. you are triggering a `build-all` (limited to the `production` env) and then you copy the `dist/production` folder into a container. So, there are 2 options here: you can run tests VS the neo development mode before running the build and more important: you can run your tests after the build is done.

For the framework itself, it is a bit more tricky: I started writing some tests based on the previous (non open source) version of Siesta: https://www.bryntum.com/products/siesta/.

You can find these tests here:
https://github.com/neomjs/neo/tree/dev/test/siesta

There are 3 areas I focussed on:
1. The class config system
2. The vdom engine
3. collections

Since this version of Siesta is "deprecated", I took a break on this part. However, there is a new and very promising new version of Siesta on the horizon:
https://github.com/bryntum/siesta/tree/master (v6, currently in beta-state)

Once this version reaches the GA, it would make sense to start on rewriting the current tests plus adding more. @matsbryntse @canonic-epicure Mats and Nick can hopefully provide more input.

I would also like to differentiate between:
1. unit tests
2. cross realm tests
3. user journey tests

For unit tests, there are a lot of different tools out there. testing functions on their own imo only makes sense for tricky algorithms.

For the neo scope we are dealing with an async composition of tasks, which are running inside different realms (main thread VS workers). sadly, as far as i know, there is not a single testing tool out there which supports cross worker testing. inside the current tests, i simply imported the vdom engine into a main thread. good enough to test the logic on its own, but it does not cover the real world use case.

This leads to point 3, which is the most important testing scenario. Testing real world user journeys directly inside the browser. For this scenario, the internal logic is a bit of a black box, but it does ensure that the main features of an app or framework examples work. Some alternative options we could look into like Cypress or Selenium.

Feel free to add your thoughts here or hop into the Slack channel:
https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA

Best regards,
Tobias

### @github-actions - 2024-08-30T02:27:59Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:59Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:30:08Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:30:09Z @github-actions closed this issue

