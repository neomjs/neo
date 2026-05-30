---
id: 3721
title: 'component.wrapper.GoogleMaps: onMarkerClick()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-12-28T19:56:41Z'
updatedAt: '2022-12-28T20:01:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3721'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-12-28T20:01:15Z'
---
# component.wrapper.GoogleMaps: onMarkerClick()

we need to get marker click events into the wrapper component.

to do this, we need to add a custom listener inside the main thread addon, import `DomEvents` to fake a real event and pass the relevant data, so that we can retrieve the record.

we also should add a custom `markerClick` event on cmp level.

## Timeline

- 2022-12-28T19:56:41Z @tobiu added the `enhancement` label
- 2022-12-28T19:56:41Z @tobiu assigned to @tobiu
- 2022-12-28T19:59:28Z @tobiu referenced in commit `7ac8701` - "component.wrapper.GoogleMaps: onMarkerClick() #3721"
- 2022-12-28T20:01:16Z @tobiu closed this issue

