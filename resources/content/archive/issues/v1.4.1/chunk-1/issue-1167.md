---
id: 1167
title: Enhanced Webpack builds (split chunks for apps & examples)
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-09-04T10:38:03Z'
updatedAt: '2020-09-09T22:16:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1167'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-09-09T22:16:29Z'
---
# Enhanced Webpack builds (split chunks for apps & examples)

Got a PoC running locally:
![Screenshot 2020-09-04 at 03 37 06](https://user-images.githubusercontent.com/1177434/92230402-5a4c7580-eeab-11ea-8a4b-1654f7035e1c.png)

<img width="1338" alt="Screenshot 2020-09-04 at 03 48 22" src="https://user-images.githubusercontent.com/1177434/92230444-6afceb80-eeab-11ea-83fd-d168a0f62ac4.png">

Will create a new branch to further test & polish this.



## Timeline

- 2020-09-04T10:38:03Z @tobiu added the `enhancement` label
- 2020-09-04T10:38:04Z @tobiu assigned to @tobiu
- 2020-09-04T10:39:08Z @tobiu referenced in commit `7fa105f` - "Enhanced Webpack builds (split chunks for apps & examples) #1167"
- 2020-09-04T11:36:13Z @tobiu referenced in commit `7188904` - "#1167 chunks names for the worker scope"
- 2020-09-04T12:04:35Z @tobiu referenced in commit `b124ac9` - "#1167 covid app: using the real appworker chunk"
- 2020-09-04T12:17:26Z @tobiu referenced in commit `5d907cc` - "#1167 removed all apps & examples build entry points"
- 2020-09-04T12:19:37Z @tobiu referenced in commit `23703c8` - "#1167 removed the entry point generation from the createApp program"
- 2020-09-04T12:37:54Z @tobiu referenced in commit `b325dee` - "#1167 package.json => removed the buildMyApps script"
- 2020-09-04T12:41:28Z @tobiu referenced in commit `d5a1033` - "#1167 removed the buildMyApps & buildDocsExamples programs. adjusted the buildAll program"
- 2020-09-05T16:38:36Z @tobiu referenced in commit `ae93dac` - "#1167 new app worker prod build entry point (in progress)"
- 2020-09-06T15:42:07Z @tobiu referenced in commit `911a9fe` - "#1167 buildThreads: added the new appworker prod build script"
- 2020-09-06T16:01:55Z @tobiu referenced in commit `74e6839` - "#1167 myApps.template.json: adjusted the input paths"
- 2020-09-08T11:20:58Z @tobiu referenced in commit `2a50373` - "#1167 webpack.config.appworker.js => default file name"
- 2020-09-08T11:38:27Z @tobiu referenced in commit `ca64f81` - "#1167 webpack.config.appworker.js => added the docs app & examples index file generation"
- 2020-09-08T11:53:23Z @tobiu referenced in commit `51c1e53` - "#1167 build.json: adjusted the input paths"
- 2020-09-08T12:00:34Z @tobiu referenced in commit `65d80b3` - "#1167 worker.App: unified the onLoadApplication() logic"
- 2020-09-08T12:15:57Z @tobiu referenced in commit `f6c5fca` - "#1167 webpack.config.appworker.js: app paths for docs&examples fix"
- 2020-09-08T12:48:36Z @tobiu referenced in commit `8665a01` - "#1167 enabled the examples tree view for the docs app"
- 2020-09-08T12:54:00Z @tobiu referenced in commit `049b379` - "#1167 added the dist versions of the shared covid apps to the website examples"
- 2020-09-08T12:55:30Z @tobiu referenced in commit `0b4de66` - "#1167 website examples: dev mode => added edge as a valid browser for all"
- 2020-09-08T13:12:10Z @tobiu referenced in commit `ab7bbf6` - "#1167 disabled the examples for the build modes (docs app) again. follow up ticket."
- 2020-09-08T16:07:32Z @tobiu referenced in commit `1f37f3a` - "#1167 added the new app worker build for dist/development"
- 2020-09-08T17:12:38Z @tobiu referenced in commit `a8dbf11` - "#1167 adjusted the createApp program to create the new input paths (app.mjs)"
- 2020-09-08T17:26:04Z @tobiu referenced in commit `6318f3a` - "#1167 package.json: removed the docs.examples build"
- 2020-09-08T17:53:53Z @tobiu referenced in commit `ba5f309` - "#1167 package.json: re-added the build-my-apps script"
- 2020-09-08T19:16:10Z @tobiu referenced in commit `8f13ea2` - "#1167 re-added the buildMyApps program, adjusted webpack.config.myapps to parse all examples & apps, but only generate the index file for the selected app(s)"
- 2020-09-08T19:47:15Z @tobiu referenced in commit `300b835` - "#1167 adjusted the webpack.config.myapps to parse all examples & apps, but only generate the index file for the selected app(s) => dist/dev"
- 2020-09-09T22:16:29Z @tobiu closed this issue

