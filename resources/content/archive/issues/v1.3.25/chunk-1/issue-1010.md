---
id: 1010
title: 'layout.Card, tab.Container: change the default of removeInactiveCards to true'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-01T03:09:32Z'
updatedAt: '2020-08-01T18:27:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1010'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-01T18:27:34Z'
---
# layout.Card, tab.Container: change the default of removeInactiveCards to true

this will affect a lot of demo apps (covid, docs, website,...) & examples, so it requires testing.

in case it works the way i think it should, it will increase the rendering performance by quite a bit.

## Timeline

- 2020-08-01T03:09:32Z @tobiu added the `enhancement` label
- 2020-08-01T03:09:32Z @tobiu assigned to @tobiu
### @tobiu - 2020-08-01T03:25:51Z

it does break the mapboxGL map & AmCharts. i guess we need to trigger the afterSetMount logic for this use case.

### @tobiu - 2020-08-01T03:27:59Z

docs app: dynamically added tabs do not get activated, highlightJS source views break. more work.

- 2020-08-01T14:28:15Z @tobiu referenced in commit `e3ed11f` - "layout.Card, tab.Container: change the default of removeInactiveCards to true #1010"
### @tobiu - 2020-08-01T14:28:31Z

the mapboxGL & AmCharts part is fixed.

- 2020-08-01T18:27:34Z @tobiu closed this issue

