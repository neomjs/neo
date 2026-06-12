---
id: 3477
title: 'component.Base: convert `cls` into a real config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-09-29T23:15:59Z'
updatedAt: '2022-09-30T20:14:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3477'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-09-30T20:14:42Z'
---
# component.Base: convert `cls` into a real config

we probably need a `wrapperCls` config as well.

## Timeline

- 2022-09-29T23:15:59Z @tobiu added the `enhancement` label
- 2022-09-29T23:15:59Z @tobiu assigned to @tobiu
- 2022-09-29T23:16:23Z @tobiu referenced in commit `dc2b15e` - "component.Base: convert cls into a real config #3477 (in progress)"
- 2022-09-30T13:29:49Z @tobiu referenced in commit `c708687` - "#3477 component.Base: afterSetWrapperCls() logic"
- 2022-09-30T13:30:25Z @tobiu referenced in commit `6bc9bf5` - "#3477 component.Base: afterSetWrapperCls() cleanup"
- 2022-09-30T13:34:30Z @tobiu referenced in commit `dc0b667` - "#3477 layout.Card: using wrapperCls"
- 2022-09-30T13:43:45Z @tobiu referenced in commit `dc1f135` - "#3477 component.Base: updateCls() => adjusted to work for cls & wrapperCls"
- 2022-09-30T13:54:07Z @tobiu referenced in commit `5367f88` - "#3477 component.Base: updateCls() => adjusted the vnode find logic (matched via the (vdom) id)"
- 2022-09-30T14:07:35Z @tobiu referenced in commit `b9fb5f7` - "#3477 component.Base: afterSetCls() => cleanup"
### @tobiu - 2022-09-30T14:41:40Z

`wrapperCls` is in place now. Since probably 98% of your components won't need a wrapper, we need a smart way to merge it with `cls` to prevent overrides.

- 2022-09-30T14:53:44Z @tobiu referenced in commit `63895ef` - "#3477 component.Base: afterSetCls() => merging cls & wrapperCls"
- 2022-09-30T14:54:58Z @tobiu referenced in commit `c3381ea` - "#3477 component.Base: cleanup"
- 2022-09-30T15:01:27Z @tobiu referenced in commit `9abec3d` - "#3477 layout.Fit: using wrapperCls"
- 2022-09-30T15:06:48Z @tobiu referenced in commit `9e23c21` - "#3477 layout.Flexbox: using wrapperCls"
- 2022-09-30T15:08:37Z @tobiu referenced in commit `6abc519` - "#3477 layout.HBox, layout.VBox: cleanup"
- 2022-09-30T15:13:04Z @tobiu referenced in commit `ee7d0c4` - "#3477 layout.Card: cleanup"
- 2022-09-30T15:49:20Z @tobiu referenced in commit `8cdb248` - "#3477 component.Base: enhancements for afterSetCls(), afterSetWrapperCls() & vdom update calls"
### @tobiu - 2022-09-30T20:14:42Z

the conversion is done. i will create follow up tickets to look into side effects.

- 2022-09-30T20:14:42Z @tobiu closed this issue

