---
id: 4608
title: 'This Styling overwrites project styling for inputFields:focus'
state: CLOSED
labels: []
assignees: []
createdAt: '2023-07-31T13:45:28Z'
updatedAt: '2023-07-31T14:18:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4608'
author: markusmorley-s2
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-31T14:18:59Z'
---
# This Styling overwrites project styling for inputFields:focus

https://github.com/neomjs/neo/blob/594ca2e1a6e5efd728b1406a496b456b1d46b2b2/resources/scss/src/form/field/Text.scss#L351

if i comment this out in my local nodeModules and run build-themes it work like expected
     // &:focus {
     //     outline : none;
     // }

## Timeline

### @tobiu - 2023-07-31T13:54:39Z

the following rule is there by design:
`.neo-textfield-input` defined on its own, is not aware if it is nested inside a wrapper containing triggers. we obviously do want that the focus outline covers the entire field component.

once an input node receives focus, neo will add `neo-focus` as a selector to the top level node of the field component.

in case there is a wrapper involved, the following rule will get applied:
https://github.com/neomjs/neo/blob/594ca2e1a6e5efd728b1406a496b456b1d46b2b2/resources/scss/src/form/field/Text.scss#L12

in case there are no triggers, the rule:
https://github.com/neomjs/neo/blob/594ca2e1a6e5efd728b1406a496b456b1d46b2b2/resources/scss/src/form/field/Text.scss#L27

should get a prio over the rule you mentioned (more specific selector).

i recommend to take a closer look by inspecting the DOM for the rules which get applied, to figure out if & where a change is required.

- 2023-07-31T14:18:30Z @tobiu referenced in commit `e94b742` - "This Styling overwrites project styling for inputFields:focus #4608"
### @tobiu - 2023-07-31T14:18:59Z

added `!important` to ensure the higher prio. will get into the next release.

- 2023-07-31T14:18:59Z @tobiu closed this issue

