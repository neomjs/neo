---
id: 4269
title: 'field.Select: When clicking on the SelectField area other than the icon, the selectList/picker shows only the 1 item that is selected'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-04-11T08:34:50Z'
updatedAt: '2023-04-13T08:31:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4269'
author: alberthashani
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-04-13T08:31:03Z'
---
# field.Select: When clicking on the SelectField area other than the icon, the selectList/picker shows only the 1 item that is selected

**Describe the bug**
field.Select: When clicking on the Select area other than the icon, the selectList/picker shows only the 1 item that is selected.

**To Reproduce**
Steps to reproduce the behavior:
1. Select one random item of a SelectField
2. After selecting, Click on SelectField (not the icon, for example in the middle of the field) 
3. The Picker should now show only the 1 selected item

Config of the select field:
{
    module: Select,
    cls: [ 'col-10-13'],
    placeholderText: 'Sort...',
    clearable: false,
    hideLabel: true,
    showOptionalText: false,
    required: false,
    editable: false,
    value: Neo.sortSelectedValue ? Neo.sortSelectedValue : null,
    listeners: {
        select: 'onSortFieldSelect'
    },
    store: {
        data: [
            { id: '1', name: 'A-Z' },
            { id: '2', name: 'Z-A' }
        ]
    }
}




## Timeline

- 2023-04-11T08:34:50Z @alberthashani added the `bug` label
- 2023-04-12T15:11:03Z @tobiu referenced in commit `f212fe9` - "#4269 SelectField example inside the forms app"
### @tobiu - 2023-04-12T17:41:26Z

@alberthashani it took me quite a while, but i can reproduce it now. the issue happens in case we programatically set a value for the field.

- 2023-04-13T08:27:58Z @tobiu referenced in commit `7d0c195` - "#4269"
- 2023-04-13T08:31:03Z @tobiu closed this issue

