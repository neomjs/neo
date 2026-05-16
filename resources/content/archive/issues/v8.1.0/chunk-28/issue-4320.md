---
id: 4320
title: 'form.field.CheckBox: groupRequired_ config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-04-26T07:20:42Z'
updatedAt: '2023-04-26T12:37:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4320'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-04-26T12:37:38Z'
---
# form.field.CheckBox: groupRequired_ config

invalid in case not at least 1 item with the same name config is checked.

## Timeline

- 2023-04-26T07:20:42Z @tobiu added the `enhancement` label
- 2023-04-26T07:20:42Z @tobiu assigned to @tobiu
- 2023-04-26T09:12:48Z @tobiu referenced in commit `2a7baa6` - "#4320 groupRequired_, beforeSetGroupRequired()"
- 2023-04-26T10:57:44Z @tobiu referenced in commit `1dcc104` - "#4320 afterSetGroupRequired()"
- 2023-04-26T11:21:31Z @tobiu referenced in commit `5e455a1` - "#4320 errorTextGroupRequired"
- 2023-04-26T12:06:08Z @tobiu referenced in commit `7fda73a` - "#4320 validate() => updated the logic to honor the new config"
- 2023-04-26T12:08:33Z @tobiu referenced in commit `5486df5` - "#4320 Form.view.pages.Page4: groupRequired"
- 2023-04-26T12:35:12Z @tobiu referenced in commit `4d5402b` - "#4320 afterSetChecked() => clean = false, validate() => smarter logic"
### @tobiu - 2023-04-26T12:37:38Z

<img width="704" alt="Screenshot 2023-04-26 at 14 35 26" src="https://user-images.githubusercontent.com/1177434/234576318-8c14fd47-2a9a-4f55-8faa-edaca2ebeec3.png">

<img width="657" alt="Screenshot 2023-04-26 at 14 35 32" src="https://user-images.githubusercontent.com/1177434/234576340-95bf468f-8ec8-415b-bab1-4618faa0c932.png">

the logic is in place now. will create a new ticket for disabling error messages for checkboxes.
@deniztoprak @alberthashani

- 2023-04-26T12:37:38Z @tobiu closed this issue

