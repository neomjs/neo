---
id: 4612
title: Variables for popover menu
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-07-31T16:05:00Z'
updatedAt: '2023-08-03T21:28:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4612'
author: mxmrtns
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-03T21:28:16Z'
---
# Variables for popover menu

For styling this component, we would need the following variables.

**Menu Item**
- height

- padding

- gap (something to control the distance between the icons and text)

- font-familiy, color, font-weight, line-height, text-transform

- font-color and icon color for disabled state

- background-color
- background-color-hover
- background-color-pressed
- background-color-disabled

-outlined-focused
 

## Timeline

- 2023-07-31T16:05:00Z @mxmrtns added the `enhancement` label
### @tobiu - 2023-07-31T22:39:05Z

i guess i should have mentioned that `menu.List` is extending `list.Base` which already has some of them :)

well, unless we do want different styling for lists when they are inside floating containers.

- 2023-07-31T22:49:33Z @tobiu referenced in commit `34f2315` - "Variables for popover menu #4612 (in progress)"
### @tobiu - 2023-07-31T22:50:12Z

added around half of them. let's connect tomorrow to figure out, if modifying `list.Base` instead is smarter.

- 2023-08-03T21:06:17Z @tobiu referenced in commit `035c209` - "Variables for popover menu #4612"
### @tobiu - 2023-08-03T21:13:21Z

i assume that "pressed" should mean "selected". unless you want a ripple effect or a different state onMouseDown (which is different to the selected look and vanishes onMouseUp).

- 2023-08-03T21:28:04Z @tobiu referenced in commit `f1e9733` - "Variables for popover menu #4612"
### @tobiu - 2023-08-03T21:28:16Z

i think i got them all now.

- 2023-08-03T21:28:16Z @tobiu closed this issue

