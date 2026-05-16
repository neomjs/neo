---
id: 2129
title: 'form.Fieldset: disableItemsOnCollapse_ config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-23T07:26:24Z'
updatedAt: '2021-05-23T09:13:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2129'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-23T09:13:47Z'
---
# form.Fieldset: disableItemsOnCollapse_ config

in case you are working with forms, you can either improve the UX when fieldsets are collapsible or you might want to exclude fieldset items from getting submitted in case the fieldset is collapsed.

we need a new config to make it optional.

## Timeline

- 2021-05-23T07:26:24Z @tobiu added the `enhancement` label
- 2021-05-23T07:26:24Z @tobiu assigned to @tobiu
- 2021-05-23T08:27:52Z @tobiu referenced in commit `d04e8df` - "form.Fieldset: disableItemsOnCollapse_ config #2129"
### @tobiu - 2021-05-23T08:30:41Z

to further enhance this:

We need a map to store the initial disabled state of fieldset items.
E.g. a map (object) with key {componentId}, value (disabledState).

In case we collapse a fieldset and a childItem is already disabled, it needs to be disabled when expanding the fieldset again.

### @tobiu - 2021-05-23T08:35:00Z

actually an array is better => only store disabled item ids.

- 2021-05-23T08:46:37Z @tobiu referenced in commit `7cc7950` - "form.Fieldset: disableItemsOnCollapse_ config #2129"
- 2021-05-23T08:53:34Z @tobiu referenced in commit `7dbfdad` - "#2129 form.Fieldset: cleanup, changed a field to disabled inside the demo app"
- 2021-05-23T09:13:47Z @tobiu closed this issue

