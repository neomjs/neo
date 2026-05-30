---
id: 4321
title: main.addon.ScrollSync
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-04-26T08:21:44Z'
updatedAt: '2023-05-12T11:07:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4321'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-12T11:07:46Z'
---
# main.addon.ScrollSync

the first use case are PickerFields (DateField, SelectField) to keep overlays sticky to input fields, in case they are inside a scrollable parent container (we need to honor horizontal & vertical scrolling on all parent levels).

this can be useful for buffered grids with locked columns later on as well. @ThorstenSuckow 

## Timeline

- 2023-04-26T08:21:44Z @tobiu added the `enhancement` label
- 2023-04-26T08:21:44Z @tobiu assigned to @tobiu
- 2023-04-26T16:25:43Z @tobiu referenced in commit `db5a20d` - "#4321 main.addon.ScrollSync: base class"
- 2023-04-26T16:28:27Z @tobiu referenced in commit `5b75bef` - "#4321 main.addon.ScrollSync: added into the DefaultConfig.mjs"
- 2023-04-26T16:45:08Z @tobiu referenced in commit `8c3085e` - "#4321 main.addon.ScrollSync: register(), unregister() as remote methods"
- 2023-05-11T12:30:51Z @tobiu referenced in commit `36b4176` - "#4321 form.field.Picker: registering pickers on show"
- 2023-05-11T12:33:05Z @tobiu referenced in commit `f9344bb` - "#4321 form.field.Picker: unregistering pickers on hide"
- 2023-05-11T12:46:08Z @tobiu referenced in commit `7d407de` - "#4321 main.addon.ScrollSync: registering a new item (in progress)"
- 2023-05-11T12:52:42Z @tobiu referenced in commit `1c38f00` - "#4321 main.addon.ScrollSync: removeItem()"
- 2023-05-11T14:23:41Z @tobiu referenced in commit `82a342b` - "#4321 main.addon.ScrollSync: calling removeItem() inside register()"
- 2023-05-12T11:07:46Z @tobiu closed this issue

