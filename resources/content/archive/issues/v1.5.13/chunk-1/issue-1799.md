---
id: 1799
title: replace node-sass with dart-sass
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-16T12:05:06Z'
updatedAt: '2021-04-16T12:08:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1799'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-16T12:08:42Z'
---
# replace node-sass with dart-sass

node-sass was charming, since it was using a faster c based compiler (libsass).

however, the project got deprecated:
https://www.npmjs.com/package/node-sass/v/5.0.0

"Warning: LibSass and Node Sass are deprecated. While they will continue to receive maintenance releases indefinitely, there are no plans to add additional features or compatibility with any new CSS or Sass features. Projects that still use it should move onto Dart Sass."

i tested the now called `sass` package (dart-sass) and the theme builds work fine.

the package is also now included officially:
https://sass-lang.com/install

## Timeline

- 2021-04-16T12:05:06Z @tobiu added the `enhancement` label
- 2021-04-16T12:05:06Z @tobiu assigned to @tobiu
- 2021-04-16T12:06:00Z @tobiu referenced in commit `0d059b2` - "replace node-sass with dart-sass #1799"
- 2021-04-16T12:08:42Z @tobiu closed this issue

