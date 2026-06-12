---
id: 4697
title: Add DACH country codes for post code validation
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-08-11T09:15:36Z'
updatedAt: '2023-08-11T11:41:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4697'
author: r-l-d
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-11T11:41:44Z'
---
# Add DACH country codes for post code validation

**Is your feature request related to a problem? Please describe.**
I need to validate DACH postal codes. Currently, in the src>form>field>ZipCode.mjs file, only DE is listed in the countryCodes opbject.

**Describe the solution you'd like**
I would like AT and CH added to the countryCodes object to validate their postal codes:

`static countryCodes = {
        DE: /^(?!01000|99999)(0[1-9]\d{3}|[1-9]\d{4})$/,
        AT: /^\d{4}$/,
        CH: /^\d{4}$/
    }`

**Describe alternatives you've considered**
Perhaps it is possible to do this with the Overwrites file instead? I'm not sure, since the countryCodes object is not part of the ZipCode config.

**Additional context**
Add any other context or screenshots about the feature request here.


## Timeline

- 2023-08-11T09:15:36Z @r-l-d added the `enhancement` label
### @tobiu - 2023-08-11T09:48:23Z

hi ross, you are very welcome to send a pull request :)

ping me in case you have questions on how that works (creating a fork).

### @r-l-d - 2023-08-11T11:28:37Z

Thanks @tobiu, I've created a PR here: https://github.com/neomjs/neo/pull/4699

- 2023-08-11T11:41:30Z @tobiu referenced in commit `881c0c3` - "#4697 form.field.ZipCode: formatting cleanup"
### @tobiu - 2023-08-11T11:41:44Z

thx! just cleaned up the formatting.

- 2023-08-11T11:41:44Z @tobiu closed this issue

