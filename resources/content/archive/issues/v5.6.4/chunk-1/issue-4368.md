---
id: 4368
title: 'form.field.Phone : Phone number validation is required'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-05-03T04:27:23Z'
updatedAt: '2023-05-03T12:46:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4368'
author: PriyankaTakalkar
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-03T12:46:34Z'
---
# form.field.Phone : Phone number validation is required

Current result: no error message when filling in fields that logically should only be filled with numbers.

Expected result: Error message should appear when exiting the fields.

## Timeline

- 2023-05-03T04:27:23Z @PriyankaTakalkar added the `enhancement` label
### @tobiu - 2023-05-03T04:53:26Z

Hi @PriyankaTakalkar!

The question is based on which logic? :)

https://html.spec.whatwg.org/multipage/input.html#telephone-state-(type=tel)
says that there is no generic recommendation, since phone numbers vary too much for given countries.

We can provide a basic input pattern like only allowing numbers and + (at the start) and maybe () and -. However, for your project, we do need more input if we want to enforce something more strict like the form field placeholder syntax.

Adding Max here as well: @mxmrtns.

- 2023-05-03T12:45:38Z @tobiu referenced in commit `5f152d7` - "form.field.Phone : Phone number validation is required #4368"
### @tobiu - 2023-05-03T12:46:34Z

super simplified:
`inputPattern: /^[0-9\-+\(\) ]+$/,`

feel free to add smarter solutions

- 2023-05-03T12:46:34Z @tobiu closed this issue

