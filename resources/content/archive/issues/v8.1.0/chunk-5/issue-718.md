---
id: 718
title: Neo.Main.getWindowData()
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-14T12:38:03Z'
updatedAt: '2020-06-14T13:32:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/718'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-14T13:32:40Z'
---
# Neo.Main.getWindowData()

for displaying popup windows, we need access to window.screenLeft & top.

remoteAccess

## Timeline

- 2020-06-14T12:38:03Z @tobiu added the `enhancement` label
- 2020-06-14T12:38:03Z @tobiu assigned to @tobiu
- 2020-06-14T12:53:18Z @tobiu changed title from **Neo.Main.getWindowPosition()** to **Neo.Main.getWindowScreen()**
### @tobiu - 2020-06-14T12:53:32Z

window.screen is not spreadable.

- 2020-06-14T12:54:09Z @tobiu referenced in commit `f6ac0a9` - "Neo.Main.getWindowScreen() #718"
- 2020-06-14T12:54:22Z @tobiu closed this issue
- 2020-06-14T13:32:08Z @tobiu reopened this issue
- 2020-06-14T13:32:13Z @tobiu changed title from **Neo.Main.getWindowScreen()** to **Neo.Main.getWindowData()**
### @tobiu - 2020-06-14T13:32:40Z

adjusted to:
```
    getWindowData() {
        const win    = window,
              screen = win.screen;

        return {
            innerHeight: win.innerHeight,
            innerWidth : win.innerWidth,
            outerHeight: win.outerHeight,
            outerWidth : win.outerWidth,
            screen: {
                availHeight: screen.availHeight,
                availLeft  : screen.availLeft,
                availTop   : screen.availTop,
                availWidth : screen.availWidth,
                colorDepth : screen.colorDepth,
                height     : screen.height,
                orientation: {angle: screen.orientation.angle, type: screen.orientation.type},
                pixelDepth : screen.pixelDepth,
                width      : screen.width
            },
            screenLeft: win.screenLeft,
            screenTop : win.screenTop,
        };
    }
```

- 2020-06-14T13:32:40Z @tobiu closed this issue

