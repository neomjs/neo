---
id: 5758
title: Remove main.addon.Browser
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2024-08-14T22:41:55Z'
updatedAt: '2024-08-15T00:05:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5758'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-15T00:05:57Z'
---
# Remove main.addon.Browser

@Dinkh @rwaters:
https://github.com/neomjs/neo/blob/dev/src/main/addon/Browser.mjs
We should really stick to feature detection and not use regex to try determine a device type, which is not needed. The regex contains very outdated device types, but this is not the point.

Counter example:
```
    // worker.Manager
    detectFeatures() {
        let me = this;

        NeoConfig.hasMouseEvents = matchMedia('(pointer:fine)').matches;
        NeoConfig.hasTouchEvents = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        if (window.Worker) {
            me.webWorkersEnabled = true
        } else {
            throw new Error('Your browser does not support Web Workers')
        }

        if (window.SharedWorker) {
            me.sharedWorkersEnabled = true
        }
    }

    // main.addon.DragDrop
        if (Neo.config.hasMouseEvents) {
            imports.push(import('../draggable/sensor/Mouse.mjs'))
        }

        if (Neo.config.hasTouchEvents) {
            imports.push(import('../draggable/sensor/Touch.mjs'))
        }
```

What could be important for styling (like the ContentBoxes inside the Portal App) is the info, if there is a mouse or not. So adding a new CSS rule to the doc body like `neo-no-mouse` should be fine.

For styling, only the sizes matter (responsive breakpoints).

If you want to get the user agent info for a specific use case, you can already easily do it:
```
Neo.Main.getByPath({path: 'navigator.userAgent'}).then(userAgent => {});
```

## Timeline

- 2024-08-14T22:41:55Z @tobiu added the `enhancement` label
### @rwaters - 2024-08-14T22:47:22Z

Agreed that feature detection & media queries over browser detection are the way to go.  Provides much more future proof code that does not need to be continually maintained as browsers evolve.

- 2024-08-14T22:47:22Z @rwaters closed this issue
- 2024-08-14T22:47:44Z @rwaters reopened this issue
- 2024-08-14T23:48:50Z @tobiu referenced in commit `1e0077d` - "reverted using the browser addon inside the portal app #5758"
- 2024-08-14T23:55:53Z @tobiu referenced in commit `aa0136a` - "#5758 Portal.view.home.ContentBox: using the new no-mouse rule"
- 2024-08-15T00:04:31Z @tobiu referenced in commit `2d10a9b` - "#5758 Portal.view.home.ContentBox: restoring the lost formatting"
- 2024-08-15T00:05:42Z @tobiu referenced in commit `ac4de06` - "Remove main.addon.Browser #5758"
- 2024-08-15T00:05:57Z @tobiu closed this issue

