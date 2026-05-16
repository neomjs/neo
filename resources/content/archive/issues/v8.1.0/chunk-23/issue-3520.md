---
id: 3520
title: 'form.field.Text: labelPosition: ''inline'' is broken'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-10-04T21:29:17Z'
updatedAt: '2022-10-04T21:41:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3520'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-10-04T21:41:02Z'
---
# form.field.Text: labelPosition: 'inline' is broken

will take a look into it.

pretty sure it is related to the latest changes of `component.Base` => e.g. converting `style` into a config.

<img width="810" alt="Screenshot 2022-10-04 at 23 27 42" src="https://user-images.githubusercontent.com/1177434/193933757-1723e8b3-226f-43e4-bf28-c5b5519f1a11.png">


## Timeline

- 2022-10-04T21:29:17Z @tobiu added the `bug` label
- 2022-10-04T21:29:17Z @tobiu assigned to @tobiu
- 2022-10-04T21:39:07Z @tobiu referenced in commit `74100ec` - "form.field.Text: labelPosition: 'inline' is broken #3520"
### @tobiu - 2022-10-04T21:41:02Z

looks fine again:
<img width="226" alt="Screenshot 2022-10-04 at 23 38 30" src="https://user-images.githubusercontent.com/1177434/193935378-f041ffcd-d0e2-4834-97b1-3b54766c2ebe.png">

with merging `cls` & `wrapperCls`, we lost the ability to do silent `cls` updates. i will create a follow up ticket for this one.

- 2022-10-04T21:41:02Z @tobiu closed this issue

