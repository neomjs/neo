---
id: 4836
title: 'Neo.tree.Accordion: onStoreRecordChange doesn''t change icon'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-09-04T15:27:15Z'
updatedAt: '2023-09-04T15:36:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4836'
author: Ghost
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-04T15:36:15Z'
---
# Neo.tree.Accordion: onStoreRecordChange doesn't change icon

In `Neo.tree.Accordion` component:
 
`itemVdom = VDomUtil.getByFlag(vdom, field.name);`

doesn't find the vdom because the flag is named incorrectly. Instead of `flag: "icon"`, it should be `flag: "iconCls"`;

## Timeline

- 2023-09-04T15:27:15Z @Ghost added the `bug` label
### @tobiu - 2023-09-04T15:28:28Z

do you want to send a PR or should @Dinkh look into it?

### @Ghost - 2023-09-04T15:30:07Z

@pensuwan-k has done the change, will open the PR in a while.

- 2023-09-04T15:31:34Z @pensuwan-k referenced in commit `1e7bc28` - "#4836 Change the flag name"
- 2023-09-04T15:33:03Z @pensuwan-k cross-referenced by PR #4837
- 2023-09-04T15:34:01Z @tobiu referenced in commit `ba77e21` - "Merge pull request #4837 from pensuwan-k/dev

#4836 Change the flag name"
### @tobiu - 2023-09-04T15:36:15Z

created a new release for you: https://github.com/neomjs/neo/releases/tag/6.3.3

- 2023-09-04T15:36:15Z @tobiu closed this issue

