---
id: 5008
title: 'dialog.Base: maximise is no longer animated'
state: CLOSED
labels:
  - bug
  - good first issue
assignees: []
createdAt: '2023-10-12T06:07:57Z'
updatedAt: '2024-08-27T21:15:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5008'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-27T21:15:03Z'
---
# dialog.Base: maximise is no longer animated

regression issue.

before removing the wrapper, we had the following CSS rule(s):
https://github.com/neomjs/neo/blob/7c7d3bd794ab3f00845de69645dc0214feee4fab/resources/scss/src/dialog/Base.scss#L25

to do it in a good way, the dialog should get a new config called `animate_`.

`animateTargetId` is still needed for spawn animations, but a more generic config to enable / disable all animations seems reasonable.

`afterSetAnimate()`should add a new top level CSS rule like `neo-animated` which should contain similar rules to the old wrapper CSS.

## Timeline

- 2023-10-12T06:07:58Z @tobiu added the `bug` label
- 2023-10-12T06:07:58Z @tobiu added the `good first issue` label
### @ExtAnimal - 2023-10-12T06:20:31Z

`animate` is too broad a name. This is to affect only whether maximize animates or not?

I suggest making `maximizable` a potentially granular config eg:

`maximizable : true/false` to enable and disable maximizing (and control the visibility of the button) in the basic case.

and

```
maximizable : {
    animate : true
}
```

It's a truthy value, so it is maximizable. And it describe *how* to maximize.

This concept van be applied to many configs whose modes of operation is spread among several related configs.

### @tobiu - 2024-08-27T21:15:03Z

bug already fixed.

the maximise button is controlled via a header action. feel free to open a follow up ticket, in case we want to be able to maximise without an animation.

- 2024-08-27T21:15:03Z @tobiu closed this issue

