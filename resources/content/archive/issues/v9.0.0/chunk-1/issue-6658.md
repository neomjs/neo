---
id: 6658
title: 'examples/grid/bigData: sometimes component based columns break'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-04-16T11:32:37Z'
updatedAt: '2025-04-16T14:19:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6658'
author: tobiu
commentsCount: 6
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-16T13:39:06Z'
---
# examples/grid/bigData: sometimes component based columns break

* Edge case, but I have seen it at least 10x already, so it needs investigation.
* Sometimes, component based columns get moved into the wrong wrapper / get duplicated

<img width="1246" alt="Image" src="https://github.com/user-attachments/assets/c466c774-32b9-4770-83b4-fb4fd9eb3b9e" />

## Timeline

- 2025-04-16T11:32:37Z @tobiu added the `bug` label
- 2025-04-16T11:32:37Z @tobiu assigned to @tobiu
### @tobiu - 2025-04-16T12:09:53Z

@gplanansky @camtnbikerrwc & others who are interested:
How would you locate a bug as bizarre as this one?

It is obviously related to cycling component based columns.
Switching to row based components: https://github.com/neomjs/neo/issues/6327 might already resolve it (since we would only cycle rows then), but still, it feels worth to explore what is happening.

We do have a DOM corruption. To narrow it down, the first thing I looked into is the related progress component itself, to figure out if we also have a corruption inside the vdom:

<img width="1048" alt="Image" src="https://github.com/user-attachments/assets/99e76497-7049-46e6-8ef2-cdcbeaeef6ab" />

The `vdom` is looking fine. The progress wrapper (neo-vnode-199) is only containing one progress node (neo-base-12-component-48). The label contains `removeDom: true`, so it is not painted.

The next thing to look into is the `vnode`. The wrapper node has the same id (neo-vnode-199), but the child node got reduced to only contain a `componentId`. This already does give us a clue.

### @tobiu - 2025-04-16T12:14:38Z

The next thing to look into is the initial working state before cycling:

<img width="1057" alt="Image" src="https://github.com/user-attachments/assets/5f220a1d-e701-4477-be67-6c9220d72de1" />

`vdom` & `vnode` are in sync, no replacement.

### @tobiu - 2025-04-16T12:44:30Z

As the next step, we need to investigate the logic which does replace components with `componentId` based references.

It has to be:
`component.Base: syncVnodeTree()`

This one is using:
`manager.Component: addVnodeComponentReferences()`

We obviously do not want to replace a component which is using a wrapper node inside its own wrapper.

I added a check to see if the direct parent node is a wrapper:
`isWrapper  = childNodes.length > 0 && me.wrapperNodes.get(vnode.id) || false`

and logged it into the console, in case a component to replace is found:

<img width="1012" alt="Image" src="https://github.com/user-attachments/assets/3b88a7f3-37b8-4242-b5f4-f6f8c6713472" />


This looks like a good starting point.

- 2025-04-16T13:00:39Z @tobiu referenced in commit `39bbdb7` - "#6658 manager.Component: addVnodeComponentReferences() => adding an additional top-level wrapper node check"
### @tobiu - 2025-04-16T13:04:29Z

Testing the new change:

<img width="1052" alt="Image" src="https://github.com/user-attachments/assets/cf5a19d8-f37e-4a5f-94ae-4f02b872fd39" />

While the vnode no longer gets replaced with a reference, this is not it.

We are still on symptoms level, and this is not the root cause.

We got another hint though:
How is it possible, that a specific wrapper gets a child node with a different id?

Assuming that the vdom delta update logic works correctly, I need to take a deeper look into the grid column component based cycling.

- 2025-04-16T13:34:47Z @tobiu referenced in commit `6b8892c` - "#6658 manager.Component: addVnodeComponentReferences() => removing the wrapper check"
- 2025-04-16T13:35:16Z @tobiu referenced in commit `984fef0` - "#6658 grid.column.Component: ensuring that wrapped components which don't have a wrapperId, always get an index-based one"
### @tobiu - 2025-04-16T13:39:06Z

@gplanansky @camtnbikerrwc In the end, adding this into `grid.column.Component` fixed it:

```
// We need to ensure that wrapped components always get the same index-based id.
if (!component.vdom.id) {
    component.vdom.id = id + '__wrapper'
}
```

The wrapper check inside `manager.Component` is no longer needed.

While the fix itself was easy (just ensuring that wrapped components always have the same index based id), finding it was non-trivial.

- 2025-04-16T13:39:06Z @tobiu closed this issue
### @camtnbikerrwc - 2025-04-16T14:18:58Z

That fixed my grid issue I suspect GerSent from my iPhoneOn Apr 16, 2025, at 6:39 AM, Tobias Uhlig ***@***.***> wrote:﻿
  @gplanansky @camtnbikerrwc In the end, adding this into grid.column.Component fixed it:
// We need to ensure that wrapped components always get the same index-based id.
if (!component.vdom.id) {
    component.vdom.id = id + '__wrapper'
}

The wrapper check inside manager.Component is no longer needed.
While the fix itself was easy (just ensuring that wrapped components always have the same index based id), finding it was non-trivial.—Reply to this email directly, view it on GitHub, or unsubscribe.You are receiving this because you were mentioned.Message ID: ***@***.***>



tobiu left a comment (neomjs/neo#6658)
@gplanansky @camtnbikerrwc In the end, adding this into grid.column.Component fixed it:
// We need to ensure that wrapped components always get the same index-based id.
if (!component.vdom.id) {
    component.vdom.id = id + '__wrapper'
}

The wrapper check inside manager.Component is no longer needed.
While the fix itself was easy (just ensuring that wrapped components always have the same index based id), finding it was non-trivial.

—Reply to this email directly, view it on GitHub, or unsubscribe.You are receiving this because you were mentioned.Message ID: ***@***.***>


