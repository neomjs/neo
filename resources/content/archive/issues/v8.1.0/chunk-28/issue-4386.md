---
id: 4386
title: 'form.field.Phone: inputPattern edge cases'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-05-04T19:44:21Z'
updatedAt: '2024-09-12T02:29:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4386'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:19Z'
---
# form.field.Phone: inputPattern edge cases

@ki1pen @deniztoprak 

the new inputPattern regex does not support the following format:
`+49 (151) 1234 567`

so we should polish it more. open for ideas :)

## Timeline

- 2023-05-04T19:44:21Z @tobiu added the `enhancement` label
### @ki1pen - 2023-05-05T13:45:13Z

@tobiu 
Does it need to accept something like this?
+(123) (123) 456-7-890
(+123) 456 789
+(12-3) 456 789
+123 456 (789)

### @deniztoprak - 2023-05-07T21:07:10Z

It's hard to find one-size-fits-all pattern to validate tel inputs. There are some good insights here:

https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/tel#validation

There are people arguing that phone number validation is useless:

https://stackoverflow.com/questions/14639973/javascript-regex-what-to-use-to-validate-a-phone-number/21117154#21117154

And some specialized libraries which can inspire:

https://github.com/google/libphonenumber




### @github-actions - 2024-08-29T02:27:25Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:25Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:19Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:19Z @github-actions closed this issue

