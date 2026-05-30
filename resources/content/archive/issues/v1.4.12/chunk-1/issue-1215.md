---
id: 1215
title: 'Neo.config.environment (dev, dist/dev, dist/prod)'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-09-21T11:42:28Z'
updatedAt: '2020-09-21T12:49:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1215'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-09-21T12:49:21Z'
---
# Neo.config.environment (dev, dist/dev, dist/prod)

We are still using Neo.config.isExperimental.

At this point, the name is most likely no longer clear to anyone :)

Before Chrome v81, we needed an experimental web platform features flag, to enable JS modules inside the worker scope.

This one is no longer needed and the config just means mode: dev.

Will add the new config now and remove the old one once ready.

## Timeline

- 2020-09-21T11:42:28Z @tobiu added the `enhancement` label
- 2020-09-21T11:42:28Z @tobiu assigned to @tobiu
- 2020-09-21T11:48:00Z @tobiu referenced in commit `b53754d` - "#1215 added mode: 'dev' into the index files of the apps folder"
- 2020-09-21T11:54:41Z @tobiu changed title from **Neo.config.mode (dev, dist/dev, dist/prod)** to **Neo.config.environment (dev, dist/dev, dist/prod)**
### @tobiu - 2020-09-21T11:55:53Z

since we already have Neo.config.environment, i will stick to this one and add the dev mode here.

new values:
- development
- dist/development
- dist/production

- 2020-09-21T11:57:52Z @tobiu referenced in commit `65e8be7` - "#1215 adjusted the DefaultConfig environment docs comment & default value"
- 2020-09-21T11:58:58Z @tobiu referenced in commit `8cc4650` - "#1215 main.addon.Stylesheet: adjusted to the new Neo.config.environment values"
- 2020-09-21T12:02:06Z @tobiu referenced in commit `95cb81b` - "#1215 apps index files: removed the mode & isExperimental configs"
- 2020-09-21T12:02:46Z @tobiu referenced in commit `a1bed9b` - "#1215 DefaultConfig: removed isExperimental"
- 2020-09-21T12:10:39Z @tobiu referenced in commit `b1fd895` - "#1215 examples index files: removed the isExperimental configs"
- 2020-09-21T12:13:42Z @tobiu referenced in commit `864e711` - "#1215 adjusted the env config inside the buildScripts"
- 2020-09-21T12:18:06Z @tobiu referenced in commit `7ab8fdc` - "#1215 src folder: replaced all checks for Neo.config.isExperimental with Neo.config.environment"
- 2020-09-21T12:23:29Z @tobiu referenced in commit `d895caf` - "#1215 apps folder: replaced all checks for Neo.config.isExperimental with Neo.config.environment"
- 2020-09-21T12:25:44Z @tobiu referenced in commit `f8cece7` - "#1215 webstorm auto-import fix"
- 2020-09-21T12:31:24Z @tobiu referenced in commit `3c2df0b` - "#1215 docs app: replaced all checks for Neo.config.isExperimental with Neo.config.environment"
- 2020-09-21T12:33:44Z @tobiu referenced in commit `2ede876` - "#1215 removed Neo.config.isExperimental from the createApp program"
- 2020-09-21T12:35:56Z @tobiu referenced in commit `a02afa9` - "#1215 removed Neo.config.isExperimental from the siesta testing setups"
- 2020-09-21T12:48:48Z @tobiu referenced in commit `615bb8e` - "#1215 App worker path fix, stylesheet main thread addon => switch to the dist/development theme again for the development mode"
### @tobiu - 2020-09-21T12:49:21Z

done.

- 2020-09-21T12:49:21Z @tobiu closed this issue

