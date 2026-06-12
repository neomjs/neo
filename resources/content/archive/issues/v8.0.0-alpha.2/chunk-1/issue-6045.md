---
id: 6045
title: Scoped vdom trees
state: CLOSED
labels:
  - enhancement
  - epic
assignees:
  - tobiu
createdAt: '2024-11-03T21:49:37Z'
updatedAt: '2024-11-08T14:23:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6045'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 6047 util.VDom: syncVdomIds() => map the vdom of direct children'
  - '[x] 6048 component.Base: updateDepth_ config'
  - '[x] 6049 container.Base: insert() => updateDepth -1'
  - '[x] 6050 container.Base: removeAt() => updateDepth = 2'
  - '[x] 6051 container.Base: switchItems() => updateDepth = 2'
  - '[x] 6052 container.Base: insert() => only add a cmp reference into the vdom'
  - '[x] 6053 manager.Component: getVnodeTree()'
  - '[x] 6054 util.Vnode: getVnode()'
  - '[x] 6055 manager.Component: addVnodeComponentReferences()'
  - '[x] 6056 container.Base: add top level ids to component based vdom references'
  - '[x] 6057 vdom.Helper: compareAttributes() => exclude component references from delta parsings'
  - '[x] 6058 vdom.VNode: add the optional componentId config'
  - '[x] 6059 vdom.Helper: createVnode() => add support for the componentId reference'
  - '[x] 6060 component.Base: syncVnodeTree() => pass component ids for child node mappings'
  - '[x] 6061 manager.Component: getVdomTree(), getVnodeTree() => depth'
  - '[x] 6063 manager.Component: addVnodeComponentReferences() => add support for wrapped components'
  - '[x] 6064 util.VNode: getChildIds() => exclude component references'
  - '[x] 6065 manager.Component: add a 2nd map for wrapped components'
  - '[x] 6066 component.Base: syncVnodeTree() => register top level wrapper nodes'
  - '[x] 6067 component.Base: shorten the vdom & vnode component references'
  - '[x] 6068 vdom.Helper: compareAttributes() => adjust the componentId check'
  - '[x] 6069 form.field.Text: add triggers as cmp references into the vdom'
  - '[x] 6070 examples.table.container.MainContainer: add table cell buttons as reference objects'
  - '[x] 6071 examples.table.nestedRecordFields.MainContainer: add cell based buttons as vdom references'
  - '[x] 6072 component.Base: executeVdomUpdate() => reset update depth to the proto value'
  - '[x] 6073 vdom.Helper: createVnode() => do not create vnode instances for component reference objects'
  - '[x] 6074 util.VDom: find()'
  - '[x] 6075 manager.Component: addVnodeComponentReferences() => update parent cmp references for wrapped cmps'
  - '[x] 6076 replace all util.VDom: findVdomChild() calls with find()'
  - '[x] 6077 selection.table.*: set the updateDepth to 2 for selection based updates'
  - '[x] 6078 selection.table.CellRowModel: set the updateDepth to 2 for row selection methods'
  - '[x] 6079 selection.grid.*: set the updateDepth to 2 for selection based updates'
  - '[x] 6080 Neo.selection.grid.BaseModel, Neo.selection.table.BaseModel'
  - '[x] 6081 list.Chip: createItemContent() => drop a cmp reference into the parent vdom'
  - '[x] 6082 list.Circle: createItemContent() => drop a cmp reference into the parent vdom'
  - '[x] 6085 calendar.view.week.Component: construct() => add the TimeAxis as a vdom reference'
  - '[x] 6086 calendar.view.calendars.List: createItemContent() => add the CheckBoxField as a vdom reference'
  - '[x] 6087 table.header.Button: afterSetShowHeaderFilter() => add content as a vdom reference'
  - '[x] 6088 table.header.Toolbar: afterSetShowHeaderFilters() => adjust the updateDepth'
  - '[x] 6091 calendar.view.SettingsContainer: collapse(), expand() => updateDepth'
subIssuesCompleted: 40
subIssuesTotal: 40
blockedBy: []
blocking: []
closedAt: '2024-11-08T14:23:56Z'
---
# Scoped vdom trees

See https://github.com/orgs/neomjs/discussions/5408

## Timeline

- 2024-11-03T21:49:37Z @tobiu added the `enhancement` label
- 2024-11-03T21:49:37Z @tobiu added the `epic` label
- 2024-11-03T21:49:37Z @tobiu assigned to @tobiu
- 2024-11-03T21:53:56Z @tobiu referenced in commit `4141e0b` - "#6045 Scoped vdom trees: container.Base: createItems() => adding component references into the vdom"
- 2024-11-03T22:21:09Z @tobiu referenced in commit `7f1c86a` - "#6045 Scoped vdom trees: manager.Component: getVdomRenderTree()"
- 2024-11-03T23:20:14Z @tobiu referenced in commit `18ab0f6` - "#6045 Scoped vdom trees: util.Vdom: syncVdomIds() => using manager.Component to replace vdom references if needed"
- 2024-11-03T23:34:04Z @tobiu referenced in commit `756b99a` - "#6045 Scoped vdom trees: util.Vdom: replaceVdomChild() => using manager.Component to replace vdom references if needed"
- 2024-11-03T23:50:04Z @tobiu referenced in commit `25801ee` - "#6045 Scoped vdom trees: util.Vdom: getParentNodes() => using manager.Component to replace vdom references if needed"
- 2024-11-03T23:52:55Z @tobiu referenced in commit `2ba30b0` - "#6045 Scoped vdom trees: util.Vdom: getVdom() => convenience shortcut"
- 2024-11-03T23:59:21Z @tobiu referenced in commit `1a9e3b3` - "#6045 Scoped vdom trees: util.Vdom: adjusted all relevant methods"
- 2024-11-04T10:56:44Z @tobiu referenced in commit `2af9a57` - "#6045 Scoped vdom trees: WIP"
- 2024-11-05T13:55:36Z @tobiu referenced in commit `9291721` - "#6045 manager.Component: getVdomTree() => cleanup"
- 2024-11-07T09:13:51Z @tobiu referenced in commit `67d6a56` - "#6045 manager.Component: getVnodeTree() => keeping references for unmounted cmps"
- 2024-11-07T09:28:44Z @tobiu referenced in commit `eff425f` - "#6045 vdom.Helper: findMovedNodes() => honor cmp references which don't have a childNodes prop now"
- 2024-11-08T13:09:13Z @tobiu referenced in commit `77aebd7` - "#6045 Scoped vdom trees: container.Base: createItems() => adding component references into the vdom"
- 2024-11-08T13:09:13Z @tobiu referenced in commit `0be0949` - "#6045 Scoped vdom trees: manager.Component: getVdomRenderTree()"
- 2024-11-08T13:09:13Z @tobiu referenced in commit `e6acd3a` - "#6045 Scoped vdom trees: util.Vdom: syncVdomIds() => using manager.Component to replace vdom references if needed"
- 2024-11-08T13:09:14Z @tobiu referenced in commit `8f3f8ae` - "#6045 Scoped vdom trees: util.Vdom: replaceVdomChild() => using manager.Component to replace vdom references if needed"
- 2024-11-08T13:09:14Z @tobiu referenced in commit `dc0a230` - "#6045 Scoped vdom trees: util.Vdom: getParentNodes() => using manager.Component to replace vdom references if needed"
- 2024-11-08T13:09:14Z @tobiu referenced in commit `a9993d0` - "#6045 Scoped vdom trees: util.Vdom: getVdom() => convenience shortcut"
- 2024-11-08T13:09:14Z @tobiu referenced in commit `84f7d69` - "#6045 Scoped vdom trees: util.Vdom: adjusted all relevant methods"
- 2024-11-08T13:09:14Z @tobiu referenced in commit `c16d135` - "#6045 Scoped vdom trees: WIP"
- 2024-11-08T13:09:14Z @tobiu referenced in commit `3321cdf` - "#6045 manager.Component: getVdomTree() => cleanup"
- 2024-11-08T13:09:17Z @tobiu referenced in commit `a20f353` - "#6045 manager.Component: getVnodeTree() => keeping references for unmounted cmps"
- 2024-11-08T13:09:17Z @tobiu referenced in commit `7da4e3b` - "#6045 vdom.Helper: findMovedNodes() => honor cmp references which don't have a childNodes prop now"
### @tobiu - 2024-11-08T14:23:56Z

follow up items as new tickets, since the feature branch is merged.

- 2024-11-08T14:23:57Z @tobiu closed this issue

