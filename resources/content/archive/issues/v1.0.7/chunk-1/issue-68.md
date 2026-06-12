---
id: 68
title: 'RealWorld app: Create Post'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2019-11-19T19:43:18Z'
updatedAt: '2019-11-27T12:13:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/68'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2019-11-27T12:13:28Z'
---
# RealWorld app: Create Post

RealWorld.views.article.CreateComponent

Similar to Sign In:
1) fetch the form data
2) show errors
3) TagField: (cls: ['tag-list'])
3.1) add tags (onKeyDownEnter)
3.2) prevent adding tags with the same name
3.3) tags should be closable
4) RealWorld.api.Article => post()

## Timeline

- 2019-11-19T19:43:18Z @tobiu added the `enhancement` label
- 2019-11-19T19:49:05Z @mrsunshine assigned to @mrsunshine
- 2019-11-21T16:51:15Z @mrsunshine referenced in commit `19a5b6b` - "Post article via API #68"
- 2019-11-21T23:25:59Z @mrsunshine referenced in commit `e8a4525` - "CreateComponent: Add article tag handling to component #68"
### @mrsunshine - 2019-11-26T20:27:35Z

@tobiu please at the value='' reset for the tag field after enter

- 2019-11-26T20:27:49Z @mrsunshine unassigned from @mrsunshine
- 2019-11-26T20:27:49Z @mrsunshine assigned to @tobiu
### @tobiu - 2019-11-27T12:13:28Z

done.

- 2019-11-27T12:13:28Z @tobiu closed this issue

