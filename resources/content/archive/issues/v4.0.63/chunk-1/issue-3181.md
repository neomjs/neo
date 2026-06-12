---
id: 3181
title: 'buildScripts/createClass: support for extending controller.Component'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-06-22T14:11:24Z'
updatedAt: '2022-07-03T09:31:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3181'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-03T09:31:45Z'
---
# buildScripts/createClass: support for extending controller.Component

it would be nice to check for a related view, import the view controller and add it as a view config.

## Timeline

- 2022-06-22T14:11:24Z @tobiu added the `enhancement` label
- 2022-06-22T14:11:25Z @tobiu assigned to @tobiu
- 2022-06-22T14:14:16Z @tobiu referenced in commit `aee465c` - "buildScripts/createClass: support for extending controller.Component #3181"
- 2022-06-22T14:24:34Z @tobiu referenced in commit `be74bcf` - "#3181 check if a related view for controller.Component does exist"
- 2022-06-22T14:50:29Z @tobiu referenced in commit `c89d1f9` - "#3181 sorted importing of the controller inside the view file"
- 2022-06-22T15:20:21Z @tobiu referenced in commit `b6e7fa8` - "#3181 adjusting spaces for other view imports (block formatting)"
### @tobiu - 2022-06-22T16:44:47Z

<img width="640" alt="Screenshot 2022-06-22 at 18 43 50" src="https://user-images.githubusercontent.com/1177434/175092219-e7ee73d8-0d00-44df-b323-46dd568f96be.png">

<img width="697" alt="Screenshot 2022-06-22 at 18 44 16" src="https://user-images.githubusercontent.com/1177434/175092237-16b0a233-9525-4cef-8b03-96a9212a2a15.png">


### @tobiu - 2022-06-22T16:47:54Z

<img width="791" alt="Screenshot 2022-06-22 at 18 47 13" src="https://user-images.githubusercontent.com/1177434/175093142-4a3420aa-06bc-47e0-815b-95dba478fb74.png">

<img width="743" alt="Screenshot 2022-06-22 at 18 47 28" src="https://user-images.githubusercontent.com/1177434/175093153-3b81015b-c278-4c63-a552-d519e283fd19.png">



### @tobiu - 2022-06-22T16:48:38Z

maybe too much focus on details (block formatting), but the import part for views works nice.

- 2022-06-22T16:53:16Z @tobiu referenced in commit `231b71e` - "#3181 polished version of adding the view import at the right index and block-formatting for from"
- 2022-06-22T17:03:41Z @tobiu referenced in commit `5eec2b2` - "#3181 cleanup"
- 2022-07-03T09:30:48Z @tobiu referenced in commit `bc57059` - "buildScripts/createClass: support for extending controller.Component #3181"
### @tobiu - 2022-07-03T09:31:45Z

<img width="1281" alt="Screenshot 2022-07-03 at 11 28 46" src="https://user-images.githubusercontent.com/1177434/177033801-efae1310-fc64-412f-b568-0efbade8e9b1.png">



- 2022-07-03T09:31:45Z @tobiu closed this issue

