---
id: 3875
title: Sub label for Neo.form.field
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-01-16T12:40:01Z'
updatedAt: '2023-01-17T11:13:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3875'
author: ki1pen
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-17T11:13:20Z'
---
# Sub label for Neo.form.field

Need sub label under the label for Neo.Form.Field
Suggestion: Add a config subLabelText to write the sub label and subLabelStyle to add style and color


## Timeline

- 2023-01-16T12:40:01Z @ki1pen added the `enhancement` label
- 2023-01-16T12:40:24Z @ki1pen changed title from **Sub label for Neo.Form.Field** to **Sub label for Neo.form.field**
### @tobiu - 2023-01-17T07:33:24Z

Hi Kiattipoom!

I will start with `form.field.Text`, which will also include the feature for DateFields, PickerFields & SelectFields.

Do we need this for checkboxes and radios as well?

TextFields have 5 different `labelPosition`s => top, right, bottom, left & inline. I think we do need to limit the new config to only get used for the top position. I guess bottom could work too.

Thoughts?

- 2023-01-17T08:24:38Z @tobiu referenced in commit `ea3c4a5` - "#3875 form.field.Text: subLabel_"
- 2023-01-17T08:29:15Z @tobiu referenced in commit `42dcbc2` - "#3875 form.field.Text: afterSetTriggers() fix, added the new config into the TextField example"
### @ki1pen - 2023-01-17T08:37:27Z

form.field.Text should be enough for now. 
Top and bottom labelPositions work. But most of the use case would be top labelPosition.

- 2023-01-17T09:45:17Z @tobiu referenced in commit `2933343` - "#3875 form.field.Text: subLabelBaseCls, subLabelCls_"
- 2023-01-17T09:46:25Z @tobiu referenced in commit `8602284` - "#3875 form.field.Range: adjusted the logic to honor subLabelText nodes"
- 2023-01-17T09:56:50Z @tobiu referenced in commit `3d4c76d` - "#3875 form.field.Text: styling src, theme-light"
- 2023-01-17T10:00:21Z @tobiu referenced in commit `2da16e5` - "#3875 form.field.Text: theme-dark"
- 2023-01-17T11:12:50Z @tobiu referenced in commit `eb2dcdd` - "#3875 form.field.Text: afterSetLabelPosition() hiding a subLabel, in case the position is not top."
### @tobiu - 2023-01-17T11:13:20Z

finished the support for position top. i think we can ignore bottom.

<img width="996" alt="Screenshot 2023-01-17 at 10 55 54" src="https://user-images.githubusercontent.com/1177434/212884758-15e8f51d-d494-44a7-a0dc-0c3ca48a25d3.png">


- 2023-01-17T11:13:20Z @tobiu closed this issue
- 2023-01-17T12:38:12Z @ki1pen closed this issue

