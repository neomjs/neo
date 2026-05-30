---
id: 3806
title: 'form.field.Picker: editable_'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-01-06T14:27:35Z'
updatedAt: '2023-01-20T15:41:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3806'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-20T15:41:14Z'
---
# form.field.Picker: editable_

setting the config to true should disable typing into the field.

instead, the entire field should get a `cursor: pointer` and clicking the field should open the list.

## Timeline

- 2023-01-06T14:27:35Z @tobiu added the `enhancement` label
- 2023-01-16T11:20:39Z @tobiu cross-referenced by #3874
### @tobiu - 2023-01-16T11:23:11Z

let's make this ticket a priority item :) 

- 2023-01-16T12:19:13Z @tobiu referenced in commit `0ac37c6` - "form.field.Select: editable_ #3806 adding the config"
- 2023-01-16T12:22:51Z @tobiu referenced in commit `3988dae` - "#3806 afterSetEditable() => adding & removing a css rule as needed"
- 2023-01-16T12:24:50Z @tobiu referenced in commit `c6ea36a` - "#3806 added an editable checkbox into the SelectField example"
- 2023-01-16T12:33:07Z @tobiu referenced in commit `d486629` - "#3806 non editable styling"
### @tobiu - 2023-01-16T12:38:09Z

i think we should move the logic one level upwards => to `form.field.Picker`. then `form.field.Date` could also use it.

- 2023-01-16T12:38:20Z @tobiu changed title from **form.field.Select: editable_** to **form.field.Picker: editable_**
- 2023-01-16T12:41:51Z @tobiu referenced in commit `cbf87e1` - "#3806 moving the logic into form.field.Picker"
- 2023-01-20T14:21:04Z @tobiu referenced in commit `8dc05a7` - "#3806 togglePicker()"
### @tobiu - 2023-01-20T15:41:14Z

done

- 2023-01-20T15:41:14Z @tobiu closed this issue

