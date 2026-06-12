---
id: 3267
title: Touch Support
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2022-07-05T12:10:55Z'
updatedAt: '2022-07-11T14:57:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3267'
author: Dinkh
commentsCount: 5
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-11T14:57:31Z'
---
# Touch Support

**Describe the bug**
The current implementation of touch support has the premiss that there is either touch support OR mouse support.
My laptop has a touchscreen and still supports mouse.

Because it is detected as touch support, it does not allow drag'n drop for the mouse.

**Desktop (please complete the following information):**
 - OS: Windows 11
 - Browser chrome
 
**Additional context**
Possible solution:

Detect if isMobile
```
isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
```

If isMobile do not support mouse support. If !isMobile support touch AND mouse




## Timeline

- 2022-07-05T12:10:55Z @Dinkh added the `bug` label
### @tobiu - 2022-07-05T12:33:56Z

what is `IEMobile` xD

Can you try this one on Windows to check for mouse support please?
`matchMedia('(pointer:fine)').matches` (e.g. just drop it into the console)

### @Dinkh - 2022-07-06T07:22:12Z

returns true.

### @tobiu - 2022-07-06T07:33:54Z

for me, it also returns false in case i switch to a mobile view in chrome.

my strategy would be to use this one to check for a mouse => if true use the mouse sensor, then use our previous touch check => else if true use the touch sensor.

a follow up ticket could be to adjust at run-time (e.g. a user plugs in a mouse after a neo app got loaded).

### @Dinkh - 2022-07-11T11:36:19Z

Did you reload and check isMobile again. Should work, probably a Mac issue?

- 2022-07-11T14:55:05Z @tobiu referenced in commit `d69fdfc` - "Touch Support #3267"
### @tobiu - 2022-07-11T14:57:31Z

added the option to add BOTH sensors in case hasMouseSupport() and hasTouchSupport() both return true.

however, this does not include the edge case to start a drag OP with the mouse, then finish a touch based DD OP and afterwards drop with the mouse. feel free to add a new ticket in case this one is needed.

- 2022-07-11T14:57:31Z @tobiu closed this issue
- 2022-07-12T12:05:30Z @tobiu cross-referenced by #3146

