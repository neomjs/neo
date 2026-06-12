---
id: 4332
title: 'form.field.Date: ensure that the picker always shows the year which matches the input field'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-04-27T13:51:54Z'
updatedAt: '2023-04-28T14:50:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4332'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-04-28T14:50:33Z'
---
# form.field.Date: ensure that the picker always shows the year which matches the input field

it seems like it is always choosing the current year. will investigate.

## Timeline

- 2023-04-27T13:51:54Z @tobiu added the `bug` label
- 2023-04-27T13:51:54Z @tobiu assigned to @tobiu
### @tobiu - 2023-04-27T16:11:45Z

form.field.Date seems fine, diving into component.DatePicker now.

### @subramaniyamP - 2023-04-28T12:56:12Z

@tobiu  : 

Calendar start date logic we need to restrict. Now user able to enter Random date and page get freeze without any console errors. for that issue we shall do like - if enter random date by default we will select by default current date?

FYI:

![image](https://user-images.githubusercontent.com/126165171/235152589-22a2828e-7d34-4d9e-be0a-43a28786f739.png)


### @tobiu - 2023-04-28T13:41:49Z

i will adjust component.DatePicker today to show the correct view.

however, this ticket is not related to any UI freezes => this is most likely custom app logic running wild.

see:
https://user-images.githubusercontent.com/1177434/235163547-6f4f7ca4-7739-4408-bdbd-fe7c02b6334a.mov


- 2023-04-28T14:06:20Z @tobiu referenced in commit `66b4059` - "form.field.Date: ensure that the picker always shows the year which matches the input field #4332"
- 2023-04-28T14:16:08Z @tobiu closed this issue
### @tobiu - 2023-04-28T14:46:52Z

reopening: while this works fine for user field inputs now, the date field is lacking support for programatically set values.

- 2023-04-28T14:46:53Z @tobiu reopened this issue
- 2023-04-28T14:49:34Z @tobiu referenced in commit `caa9461` - "form.field.Date: ensure that the picker always shows the year which matches the input field #4332"
- 2023-04-28T14:50:33Z @tobiu closed this issue

