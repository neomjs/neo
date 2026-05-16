---
id: 4887
title: 'form.field.Date: hide the default trigger in Firefox > v109'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-09-11T16:28:06Z'
updatedAt: '2023-09-11T16:29:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4887'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-11T16:29:41Z'
---
# form.field.Date: hide the default trigger in Firefox > v109

before this version, it was easily doable...

## Timeline

- 2023-09-11T16:28:06Z @tobiu added the `enhancement` label
- 2023-09-11T16:28:07Z @tobiu assigned to @tobiu
- 2023-09-11T16:28:24Z @tobiu referenced in commit `c9f4412` - "form.field.Date: hide the default trigger in Firefox > v109 #4887"
### @tobiu - 2023-09-11T16:29:41Z

the "least worst" hack i can think of:
```
@-moz-document url-prefix() {
    .neo-datefield {
        .neo-textfield-input {
            clip-path: inset(0 2em 0 0);
        }
    }
}
```

<img width="1209" alt="Screenshot 2023-09-11 at 18 29 23" src="https://github.com/neomjs/neo/assets/1177434/55b2d197-8552-46c9-90c7-321d05329d38">


- 2023-09-11T16:29:41Z @tobiu closed this issue
- 2023-09-11T16:35:22Z @tobiu referenced in commit `8d61de0` - "v6.4.2 (#4888)

* form.field.Checkbox: update the styling for firefox (hiding the default icon) #4886

* form.field.Date: hide the default trigger in Firefox > v109 #4887

* v6.4.2"

