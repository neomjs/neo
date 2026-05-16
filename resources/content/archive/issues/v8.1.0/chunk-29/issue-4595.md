---
id: 4595
title: 'add "icon", "label", "anchorPoint" fields, etc to Neo.main.addon.GoogleMaps.addMarker(data)'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-07-29T23:11:20Z'
updatedAt: '2023-07-30T21:13:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4595'
author: gplanansky
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-30T21:13:00Z'
---
# add "icon", "label", "anchorPoint" fields, etc to Neo.main.addon.GoogleMaps.addMarker(data)

**The GoogleMaps legacy marker implements fields beyond the "title" and "position".**
https://developers.google.com/maps/documentation/javascript/reference/marker#MarkerOptions

The icon, label fields are useful.
(Neo examples/component/wrapper/GoogleMaps/ MapComponent.mjs already codes icons, but addon omits them.)

line 95 ff src/main/addon/GoogleMaps.mjs
 ```
  position: data.position,
  title       : data.title,
  icon       : data.icon,  // add these
  label      : data.label,    
  etc. 

```




## Timeline

- 2023-07-29T23:11:20Z @gplanansky added the `enhancement` label
- 2023-07-30T21:05:40Z @tobiu referenced in commit `da8654e` - "add "icon", "label", "anchorPoint" fields, etc to Neo.main.addon.GoogleMaps.addMarker(data) #4595"
- 2023-07-30T21:08:02Z @tobiu referenced in commit `fa071d1` - "add "icon", "label", "anchorPoint" fields, etc to Neo.main.addon.GoogleMaps.addMarker(data) #4595"
- 2023-07-30T21:09:08Z @tobiu referenced in commit `77bf802` - "#4595 component.wrapper.GoogleMaps: added anchorPoint to the model definition"
### @tobiu - 2023-07-30T21:13:00Z

added the 3

- 2023-07-30T21:13:00Z @tobiu closed this issue

