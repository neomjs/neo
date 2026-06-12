---
id: 3527
title: 'component.Base: update()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-10-04T22:43:56Z'
updatedAt: '2022-10-10T11:05:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3527'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-10-10T11:05:56Z'
---
# component.Base: update()

it would be nice to optionally reduce the amount of vdom re-assignments with a little helper convenience method.

more details tomorrow.

## Timeline

- 2022-10-04T22:43:56Z @tobiu added the `enhancement` label
- 2022-10-04T22:43:56Z @tobiu assigned to @tobiu
- 2022-10-06T12:50:17Z @tobiu referenced in commit `7200c78` - "component.Base: update() #3527"
### @tobiu - 2022-10-06T12:50:31Z

added a first PoC for `button.Base`.

- 2022-10-06T13:07:54Z @tobiu referenced in commit `04bb044` - "#3527 adjusted component.Base"
- 2022-10-06T13:16:36Z @tobiu referenced in commit `2270893` - "#3527 component.Legend"
- 2022-10-06T13:17:30Z @tobiu referenced in commit `2a5c4e5` - "#3527 component.Label"
- 2022-10-06T13:18:22Z @tobiu referenced in commit `4f66e07` - "#3527 component.Clock"
- 2022-10-06T13:21:12Z @tobiu referenced in commit `9bc0efe` - "#3527 component.Carousel"
- 2022-10-06T13:23:28Z @tobiu referenced in commit `6b8ccfa` - "#3527 component.Chip"
- 2022-10-06T13:27:13Z @tobiu referenced in commit `1db4585` - "#3527 component.Circle"
- 2022-10-06T13:30:02Z @tobiu referenced in commit `6ad49ef` - "#3527 component.DateSelector"
- 2022-10-06T13:35:09Z @tobiu referenced in commit `9bd43fc` - "#3527 component.Gallery"
- 2022-10-06T13:36:00Z @tobiu referenced in commit `de4c374` - "#3527 component.Helix"
- 2022-10-06T14:29:53Z @tobiu referenced in commit `3ad2a1b` - "#3527 container.Base"
- 2022-10-06T14:35:17Z @tobiu referenced in commit `3b90571` - "#3527 form.field.Display"
- 2022-10-06T14:37:03Z @tobiu referenced in commit `f759653` - "#3527 tab.Strip"
- 2022-10-06T14:37:49Z @tobiu referenced in commit `d5582ad` - "#3527 tab.header.Toolbar"
- 2022-10-06T14:42:24Z @tobiu referenced in commit `eae460b` - "#3527 form.field.Color"
- 2022-10-06T14:43:29Z @tobiu referenced in commit `85a06c8` - "#3527 form.field.trigger.SpinUpDown"
- 2022-10-06T14:44:30Z @tobiu referenced in commit `1d0a7ea` - "#3527 form.field.trigger.Time"
- 2022-10-06T14:45:05Z @tobiu referenced in commit `b12e1ae` - "#3527 grid.header.Toolbar"
- 2022-10-06T14:48:44Z @tobiu referenced in commit `1c9a182` - "#3527 form.field.CheckBox"
- 2022-10-06T14:49:45Z @tobiu referenced in commit `a8b1aa1` - "#3527 form.Fieldset"
- 2022-10-06T14:50:19Z @tobiu referenced in commit `53f08d3` - "#3527 form.field.Number"
- 2022-10-06T14:50:59Z @tobiu referenced in commit `14591b9` - "#3527 form.field.TextArea"
- 2022-10-06T14:52:59Z @tobiu referenced in commit `c213977` - "#3527 table.header.Toolbar"
- 2022-10-06T14:53:40Z @tobiu referenced in commit `51e7ce9` - "#3527 button.Split"
- 2022-10-06T15:05:59Z @tobiu referenced in commit `f373370` - "#3527 calendar.view.MainContainer"
- 2022-10-06T15:07:35Z @tobiu referenced in commit `c6bd252` - "#3527 calendar.view.SettingsContainer"
- 2022-10-06T15:10:02Z @tobiu referenced in commit `b462b29` - "#3527 calendar.view.YearComponent"
- 2022-10-06T15:13:30Z @tobiu referenced in commit `b80bfea` - "#3527 calendar.view.month.Component"
- 2022-10-06T15:14:38Z @tobiu referenced in commit `c1e22cc` - "#3527 calendar.view.week.Component"
- 2022-10-06T15:28:33Z @tobiu referenced in commit `ab3fe61` - "#3527 list.Base"
- 2022-10-06T15:34:52Z @tobiu referenced in commit `aff3f28` - "#3527 form.field.Text"
- 2022-10-06T15:38:18Z @tobiu referenced in commit `0c0fb40` - "#3527 list.plugin.Animate"
- 2022-10-06T15:39:55Z @tobiu referenced in commit `4449aab` - "#3527 layout.Card"
- 2022-10-06T15:41:16Z @tobiu referenced in commit `6efc779` - "#3527 selection.Model"
- 2022-10-06T15:42:40Z @tobiu referenced in commit `508df41` - "#3527 plugin.Resizable"
- 2022-10-06T15:44:11Z @tobiu referenced in commit `46ff818` - "#3527 selection.grid.CellRowModel"
- 2022-10-06T15:46:51Z @tobiu referenced in commit `635251b` - "#3527 tree.List"
- 2022-10-06T15:52:03Z @tobiu referenced in commit `09ee0ac` - "#3527 selection.grid.CellColumnModel"
- 2022-10-06T15:53:16Z @tobiu referenced in commit `27f0b2f` - "#3527 table.header.Button"
- 2022-10-06T15:54:29Z @tobiu referenced in commit `38824fe` - "#3527 sitemap.Component"
- 2022-10-06T15:55:44Z @tobiu referenced in commit `e63f7c6` - "#3527 selection.table.CellRowModel"
- 2022-10-06T15:56:54Z @tobiu referenced in commit `da225ae` - "#3527 selection.table.CellColumnRowModel"
- 2022-10-06T15:57:56Z @tobiu referenced in commit `c948880` - "#3527 selection.table.CellColumnModel"
- 2022-10-06T16:04:46Z @tobiu referenced in commit `9a1c7c4` - "#3527 rest of the src files"
- 2022-10-10T07:41:46Z @tobiu referenced in commit `e2edb69` - "#3527 started adjusting the apps folder"
- 2022-10-10T10:46:52Z @tobiu referenced in commit `6c54d0e` - "#3527 apps folder"
- 2022-10-10T10:59:18Z @tobiu referenced in commit `cd570a4` - "#3527 docs app"
- 2022-10-10T11:05:38Z @tobiu referenced in commit `dbd6ac3` - "#3527 examples"
### @tobiu - 2022-10-10T11:05:56Z

done.

- 2022-10-10T11:05:56Z @tobiu closed this issue

