---
id: 6131
title: 'component.Base: model => stateProvider'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-28T07:59:59Z'
updatedAt: '2024-11-29T18:34:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6131'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-29T18:34:17Z'
---
# component.Base: model => stateProvider

Rationale: the name "View Model" can be misleading. In e.g. React it is called "Store", which is also confusing => we have `data.Store` for tabular Data. We have `data.Model` to define the field types of "Records" and need the separation that a VM is not related to records (although there are similarities by design).

While the name `stateProvider` is a bit longer, it hopefully makes it crystal clear what it is. 

## Timeline

- 2024-11-28T07:59:59Z @tobiu added the `enhancement` label
- 2024-11-28T07:59:59Z @tobiu assigned to @tobiu
- 2024-11-29T12:48:38Z @tobiu referenced in commit `646ef66` - "#6131 Neo.state.Provider: base class"
- 2024-11-29T12:51:22Z @tobiu referenced in commit `8ef3c3f` - "#6131 component.Base: closestModel => closestProvider, removing model.Component"
- 2024-11-29T12:56:31Z @tobiu referenced in commit `daad221` - "#6131 component.Base: getModel() => getStateProvider()"
- 2024-11-29T12:59:34Z @tobiu referenced in commit `c700054` - "#6131 worker.App: isUsingViewModels => isUsingStateProviders"
- 2024-11-29T13:16:07Z @tobiu referenced in commit `5011915` - "#6131 component.Base: model_ => stateProvider_"
- 2024-11-29T13:20:59Z @tobiu referenced in commit `be52b3a` - "#6131 Colors.view.ViewportModel => Colors.view.ViewportStateProvider"
- 2024-11-29T13:24:28Z @tobiu referenced in commit `e450e42` - "#6131 controller.Component: getModel() => getStateProvider()"
- 2024-11-29T13:49:27Z @tobiu referenced in commit `dc21660` - "#6131 controller.Component: getStateProvider() => model => stateProvider"
- 2024-11-29T13:50:19Z @tobiu referenced in commit `390fcbb` - "#6131 component.Base: getStateProvider() => method order & getConfigInstanceByNtype() param fix"
- 2024-11-29T13:50:49Z @tobiu referenced in commit `98df947` - "#6131 Colors.view.ViewportController: model => stateProvider"
- 2024-11-29T13:53:37Z @tobiu referenced in commit `1d3e819` - "#6131 container.Base: createItem() => getModel() => getStateProvider()"
- 2024-11-29T14:07:04Z @tobiu referenced in commit `2ff11c2` - "#6131 state.Provider: replaced all occurrences of model with stateProvider"
- 2024-11-29T14:37:30Z @tobiu referenced in commit `1167701` - "#6131 Covid.view.MainContainerModel => Covid.view.MainContainerStateProvider"
- 2024-11-29T15:18:32Z @tobiu referenced in commit `0f6354d` - "#6131 layout.Base: getModel() => getStateProvider()"
- 2024-11-29T15:28:02Z @tobiu referenced in commit `2c028b5` - "#6131 apps/form"
- 2024-11-29T15:34:03Z @tobiu referenced in commit `e0ca655` - "#6131 Portal.view.ViewportModel => Portal.view.ViewportStateProvider"
- 2024-11-29T15:42:13Z @tobiu referenced in commit `8b3cfa2` - "#6131 Portal.view.learn.*"
- 2024-11-29T15:51:40Z @tobiu referenced in commit `828e2fb` - "#6131 SharedCovid.view.MainContainerModel => SharedCovid.view.MainContainerStateProvider"
- 2024-11-29T15:58:26Z @tobiu referenced in commit `5a6cb98` - "#6131 SharedCovid: gallery, helix & map => parent stateProvider"
- 2024-11-29T16:27:08Z @tobiu referenced in commit `05fa635` - "#6131 examples/model => examples/stateProvider"
- 2024-11-29T16:32:25Z @tobiu referenced in commit `667ff54` - "#6131 examples.stateProvider.advanced.MainContainer: using state providers"
- 2024-11-29T16:37:11Z @tobiu referenced in commit `4698e45` - "#6131 examples.stateProvider.dialog: model => stateProvider"
- 2024-11-29T16:42:54Z @tobiu referenced in commit `6c83cc7` - "#6131 examples.stateProvider.extendedClass: model => stateProvider"
- 2024-11-29T16:46:06Z @tobiu referenced in commit `607544a` - "#6131 examples.stateProvider.inline: model => stateProvider"
- 2024-11-29T16:48:48Z @tobiu referenced in commit `5c04521` - "#6131 examples.stateProvider.inlineNoModel => examples.stateProvider.inlineNoStateProvider"
- 2024-11-29T16:55:13Z @tobiu referenced in commit `78e0282` - "#6131 examples.stateProvider.multiWindow: model => stateProvider"
- 2024-11-29T16:58:10Z @tobiu referenced in commit `256707e` - "#6131 examples.stateProvider.nestedData: model => stateProvider"
- 2024-11-29T17:01:47Z @tobiu referenced in commit `af315a0` - "#6131 examples.stateProvider.table: model => stateProvider"
- 2024-11-29T17:04:03Z @tobiu referenced in commit `aa44ee7` - "#6131 examples.stateProvider.twoWay: model => stateProvider"
- 2024-11-29T17:10:33Z @tobiu referenced in commit `8a879ce` - "#6131 examples.toolbar.paging.view.MainContainerModel => examples.toolbar.paging.view.MainContainerStateProvider"
- 2024-11-29T17:16:35Z @tobiu referenced in commit `28efeb7` - "#6131 examples.treeAccordion.MainContainer: model => stateProvider"
- 2024-11-29T17:32:40Z @tobiu referenced in commit `d7cc8cd` - "#6131 examples.table.nestedRecordFields.MainContainerModel => examples.table.nestedRecordFields.MainContainerStateProvider"
- 2024-11-29T17:40:56Z @tobiu referenced in commit `facd064` - "#6131 buildScripts/createClass => model.Component => state.Provider"
- 2024-11-29T17:44:29Z @tobiu referenced in commit `1955fa7` - "#6131 buildScripts/createComponent => model.Component => state.Provider"
- 2024-11-29T17:53:23Z @tobiu referenced in commit `3b8ca6e` - "#6131 calendar.view.MainContainerModel => calendar.view.MainContainerStateProvider"
- 2024-11-29T17:56:25Z @tobiu referenced in commit `a759bb2` - "#6131 calendar.*: view model => state provider (doc comments)"
- 2024-11-29T17:58:45Z @tobiu referenced in commit `895bfd1` - "#6131 button.Base: afterSetMenu() => model => stateProvider"
- 2024-11-29T18:00:02Z @tobiu referenced in commit `21a5afa` - "#6131 controller.Component: getStore() => docs comment"
- 2024-11-29T18:02:59Z @tobiu referenced in commit `f58fccd` - "#6131 date.SelectorContainerModel => date.SelectorContainerStateProvider"
- 2024-11-29T18:08:06Z @tobiu referenced in commit `b83d6c1` - "#6131 guides.ViewModels => guides.StateProviders"
- 2024-11-29T18:33:05Z @tobiu referenced in commit `9c16940` - "#6131 guides.StateProviders => adjusted the inline examples & article text"
- 2024-11-29T18:34:17Z @tobiu closed this issue

