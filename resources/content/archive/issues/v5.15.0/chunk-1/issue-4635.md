---
id: 4635
title: examples googleMaps markerClick post-dialog freeze
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-08-04T10:36:59Z'
updatedAt: '2023-08-08T06:19:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4635'
author: gplanansky
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-08T06:19:11Z'
---
# examples googleMaps markerClick post-dialog freeze

The `examples/component/wrapper/googleMaps` app freezes after a markerClick brings up a dialog:  the dialog can be dismissed, but the map remains greyed out and unresponsive.

To reproduce:  unzip the Neo github file, install and build all, then  npm  run server-start,  navigate to the app and click on a marker.

Cause:  the `disabled ` config value is set to `true` by the onMarkerClick handler.
Fix:   set it to `false` (or just leave it at the default value of `false`).

`examples/component/wrapper/googleMaps/MapComponent.mjs`:
```
onMarkerClick(data) {
       let me = this,
            record = data.record.record,
            event = data.event;

       me.disabled = true;     // line 49:   change to false to prevent dialog freeze
```

When `me.disabled = true`, the "neo-disabled" class is added to the component, and that blocks Dom events per

resources/scss/src/Global.scss:
```
.neo-disabled {
    opacity       : v(neo-disabled-opacity);
    pointer-events: none;
}
```


## Timeline

- 2023-08-04T10:36:59Z @gplanansky added the `bug` label
- 2023-08-08T06:18:26Z @tobiu referenced in commit `3f2e045` - "examples googleMaps markerClick post-dialog freeze #4635 and a lot of cleanup"
- 2023-08-08T06:19:11Z @tobiu closed this issue

