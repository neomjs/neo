---
id: 461
title: 'Neo.main.lib.OpenStreetMaps: center() => optional animation'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-04-12T12:42:27Z'
updatedAt: '2020-04-12T13:01:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/461'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-04-12T13:01:25Z'
---
# Neo.main.lib.OpenStreetMaps: center() => optional animation

https://docs.mapbox.com/mapbox-gl-js/example/center-on-symbol/

## Timeline

- 2020-04-12T12:42:27Z @tobiu added the `enhancement` label
- 2020-04-12T12:42:27Z @tobiu assigned to @tobiu
- 2020-04-12T13:00:19Z @tobiu referenced in commit `284352c` - "Neo.main.lib.OpenStreetMaps: center() => optional animation #461"
### @tobiu - 2020-04-12T13:01:25Z

got a bit more complex.

Neo.component.wrapper.OpenStreetMap now has a private method centerMap.

Changing the center config OR calling flyTo will trigger this method and call center() inside the main thread (passing an animate param)

- 2020-04-12T13:01:25Z @tobiu closed this issue

