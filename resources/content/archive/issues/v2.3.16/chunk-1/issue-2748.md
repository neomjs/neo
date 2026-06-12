---
id: 2748
title: Animated List
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-10-02T11:12:17Z'
updatedAt: '2021-10-03T17:25:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2748'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-10-03T17:25:26Z'
---
# Animated List

We need the ability to optionally add transitions to a list for:
* sorting
* filtering
* adding / removing items
* resizing

This is similar to `component.Gallery`, but limited to 2D.

Since we want this feature for different lists, the logic should be inside a lazy loaded plugin.

If active, we need to position list items with `tanslateX` and `translateY`, fixed sizes and margins are needed.

we need an example (app) for testing as well.

## Timeline

- 2021-10-02T11:12:17Z @tobiu added the `enhancement` label
- 2021-10-02T11:12:17Z @tobiu assigned to @tobiu
- 2021-10-02T11:40:32Z @tobiu referenced in commit `41b6290` - "#2748 list.Base: animate_ config"
- 2021-10-02T11:45:05Z @tobiu referenced in commit `9747ee1` - "#2748 Neo.list.plugin.Animate: base class"
- 2021-10-02T11:56:30Z @tobiu referenced in commit `30808e5` - "#2748 list.Base: afterSetAnimate() => lazy loading the plugin and creating an instance"
- 2021-10-02T11:58:45Z @tobiu referenced in commit `86cad0a` - "#2748 list.Base: pluginAnimateConfig"
- 2021-10-02T12:03:33Z @tobiu referenced in commit `287c99d` - "#2748 Neo.examples.list.animate: copied the content of list.Base, adjusted the namespaces"
- 2021-10-02T12:06:45Z @tobiu referenced in commit `ddb1389` - "#2748 examples.list.animate.MainContainer: simplified the content"
- 2021-10-02T12:12:58Z @tobiu referenced in commit `ce510f1` - "#2748 examples.list.animate.MainContainer: top toolbar"
- 2021-10-02T12:21:30Z @tobiu referenced in commit `3119770` - "#2748 examples.list.animate.MainStore: loading the circle example data"
- 2021-10-02T12:25:29Z @tobiu referenced in commit `16a359b` - "#2748 examples.list.animate.MainModel: adjusted the fields"
- 2021-10-02T12:43:27Z @tobiu referenced in commit `4ad706e` - "#2748 examples.list.animate.List: base class"
- 2021-10-02T12:50:54Z @tobiu referenced in commit `70c6df5` - "#2748 examples.list.animate.List: adding images"
- 2021-10-02T13:51:25Z @tobiu referenced in commit `7edce70` - "#2748 examples.list.animate.List: cls config, item content wrapper"
- 2021-10-02T13:56:24Z @tobiu referenced in commit `fe1fcc2` - "#2748 examples.list.animate.List: SCSS src file"
- 2021-10-02T13:58:04Z @tobiu referenced in commit `c112c3e` - "#2748 examples.list.animate.MainContainer: list margin"
- 2021-10-02T14:07:32Z @tobiu referenced in commit `4e9286a` - "#2748 examples.list.animate.List: styling"
- 2021-10-03T10:03:52Z @tobiu referenced in commit `f954174` - "#2748 list.plugin.Animate: adjustCreateItem()"
- 2021-10-03T10:24:14Z @tobiu referenced in commit `799965e` - "#2748 list.plugin.Animate: adjustCreateItem() => scope cleanup"
- 2021-10-03T10:32:25Z @tobiu referenced in commit `091be9d` - "#2748 list.plugin.Animate: itemHeight, itemWidth configs"
- 2021-10-03T10:42:16Z @tobiu referenced in commit `51fa13b` - "#2748 list.plugin.Animate: onOwnerMounted()"
- 2021-10-03T11:05:48Z @tobiu referenced in commit `c9527ec` - "#2748 list.plugin.Animate: createItem() => item positions based on columns and rows"
- 2021-10-03T11:12:08Z @tobiu referenced in commit `31e5382` - "#2748 list.plugin.Animate: method comments"
- 2021-10-03T11:27:29Z @tobiu referenced in commit `6e92829` - "#2748 examples.list.animate.MainContainer: moved the item creation into the ctor, button handlers"
- 2021-10-03T11:34:26Z @tobiu referenced in commit `b0cad7d` - "#2748 examples.list.animate.MainContainer: changeSorting() logic"
- 2021-10-03T11:42:48Z @tobiu referenced in commit `95b9d83` - "#2748 list.plugin.Animate: store sort listener"
- 2021-10-03T11:46:32Z @tobiu referenced in commit `41a7488` - "#2748 list.plugin.Animate: css transitions"
- 2021-10-03T15:43:58Z @tobiu referenced in commit `99a72fa` - "#2748 list.plugin.Animate: itemMargin"
- 2021-10-03T15:45:41Z @tobiu referenced in commit `999baa2` - "#2748 examples.list.animate.MainContainer: removed the list margin"
- 2021-10-03T16:14:41Z @tobiu referenced in commit `b044a27` - "#2748 collection.Base: sort event params (previousItems)"
- 2021-10-03T16:54:48Z @tobiu referenced in commit `c347bcb` - "#2748 list.plugin.Animate: onSort() logic"
- 2021-10-03T16:56:46Z @tobiu referenced in commit `5325227` - "#2748 list.plugin.Animate: increased the transition duration"
- 2021-10-03T17:24:37Z @tobiu referenced in commit `89e5d07` - "#2748 list.plugin.Animate: cleanup"
### @tobiu - 2021-10-03T17:25:26Z

the basic logic is in place, will create follow up tickets

- 2021-10-03T17:25:26Z @tobiu closed this issue

