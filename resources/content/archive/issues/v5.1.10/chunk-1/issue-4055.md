---
id: 4055
title: 'button.Base: simplify the border styles'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-02-14T09:14:21Z'
updatedAt: '2023-02-15T10:30:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4055'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-15T10:30:17Z'
---
# button.Base: simplify the border styles

@mxmrtns

we should merge `button-border-color` and `button-border-width` into `button-border`.

## Timeline

- 2023-02-14T09:14:21Z @tobiu added the `enhancement` label
- 2023-02-14T09:14:22Z @tobiu assigned to @tobiu
- 2023-02-14T09:15:49Z @tobiu referenced in commit `d0c8e4a` - "button.Base: simplify the border styles #4055"
- 2023-02-14T09:29:55Z @tobiu referenced in commit `edc8ae9` - "#4055 secondary & tertiary UIs"
- 2023-02-14T09:40:59Z @tobiu referenced in commit `84e6bee` - "#4055 secondary & tertiary UIs => border-hover"
- 2023-02-15T09:38:39Z @tobiu referenced in commit `f73e279` - "#4055 button-border-color-pressed => button-border-pressed"
- 2023-02-15T09:42:46Z @tobiu referenced in commit `06f2b7f` - "#4055 button-border-color-active => button-border-active"
- 2023-02-15T09:50:13Z @tobiu referenced in commit `e1df033` - "#4055 button-border-color-disabled => button-border-disabled"
- 2023-02-15T09:53:02Z @tobiu referenced in commit `e1c3297` - "#4055 button-secondary-border-color-active => button-secondary-border-active"
- 2023-02-15T09:57:31Z @tobiu referenced in commit `c46f216` - "#4055 button-secondary-border-color-disabled => button-secondary-border-disabled"
- 2023-02-15T10:04:11Z @tobiu referenced in commit `72fa83e` - "#4055 ensuring that tab header button border styles have a priority over default button styles"
- 2023-02-15T10:06:53Z @tobiu referenced in commit `2364ce5` - "#4055 button-tertiary-border-color-active => button-tertiary-border-active"
- 2023-02-15T10:11:53Z @tobiu referenced in commit `d441a84` - "#4055 button-tertiary-border-color-disabled => button-tertiary-border-disabled"
- 2023-02-15T10:21:23Z @tobiu referenced in commit `b746fd5` - "#4055 button-secondary-border-pressed"
- 2023-02-15T10:28:32Z @tobiu referenced in commit `088bc6c` - "#4055 button-tertiary-border-pressed"
### @tobiu - 2023-02-15T10:30:17Z

i think we have all keys now @mxmrtns. the values need further testing for the framework scope, but this does not matter for the client app (using token values).

- 2023-02-15T10:30:17Z @tobiu closed this issue

