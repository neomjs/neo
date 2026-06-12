---
id: 1866
title: verify if public class fields work now using webpack based builds
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-25T07:55:26Z'
updatedAt: '2021-04-25T08:49:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1866'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-25T08:49:08Z'
---
# verify if public class fields work now using webpack based builds

not a perfect timing right after the v2 release, but just got an update on this topic:
https://github.com/webpack/webpack/issues/10216#issuecomment-826144064

will do a quick test (upgraded to webpack v5.35.1).

## Timeline

- 2021-04-25T07:55:26Z @tobiu added the `enhancement` label
- 2021-04-25T07:55:26Z @tobiu assigned to @tobiu
- 2021-04-25T07:56:17Z @tobiu referenced in commit `009920a` - "#1866 multiWindow.ViewportController: changed one config to a public class field"
- 2021-04-25T08:03:22Z @tobiu referenced in commit `cc1c775` - "#1866 added the 2 multiWindow apps to the build.json"
- 2021-04-25T08:13:05Z @tobiu referenced in commit `417b7ea` - "#1866 build.json added the shared workers build setting"
- 2021-04-25T08:22:14Z @tobiu referenced in commit `52c3ba8` - "#1866 multiWindow.ViewportController: cleanup"
### @tobiu - 2021-04-25T08:49:08Z

![Screenshot 2021-04-25 at 10 27 11](https://user-images.githubusercontent.com/1177434/115987058-c5ba9300-a5b3-11eb-9513-ca4ac4476fc9.png)

![Screenshot 2021-04-25 at 10 22 42](https://user-images.githubusercontent.com/1177434/115987066-cf43fb00-a5b3-11eb-9d80-24db2463c462.png)

![Screenshot 2021-04-25 at 10 25 50](https://user-images.githubusercontent.com/1177434/115987070-d539dc00-a5b3-11eb-8ad2-a8abcc3b2198.png)

this looks good!

- 2021-04-25T08:49:08Z @tobiu closed this issue
- 2021-04-25T10:34:32Z @tobiu referenced in commit `4a40a1a` - "#1866 multiWindow.ViewportController: changed connectedApps into a public class field"
- 2021-04-25T10:38:53Z @tobiu referenced in commit `f9327a8` - "#1866 multiWindow.MainContainerController: changed dialog into a public class field"
- 2021-04-25T12:47:02Z @tobiu referenced in commit `50537d1` - "#1866 removed a not need comma inside the index.html files"

