---
id: 5095
title: buildScripts/convertDesignTokens => add support for non-token based values containing empty chars
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-11-13T22:52:39Z'
updatedAt: '2023-11-13T22:53:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5095'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-11-13T22:53:32Z'
---
# buildScripts/convertDesignTokens => add support for non-token based values containing empty chars

@mxmrtns `font-family` names can contain blanks, in which case we want to ensure they get wrapped in '.

example: Source Code Pro => 'Source Code Pro'

## Timeline

- 2023-11-13T22:52:39Z @tobiu added the `enhancement` label
- 2023-11-13T22:52:39Z @tobiu assigned to @tobiu
- 2023-11-13T22:53:13Z @tobiu referenced in commit `3e102e4` - "buildScripts/convertDesignTokens => add support for non-token based values containing empty chars #5095"
- 2023-11-13T22:53:32Z @tobiu closed this issue
- 2023-11-16T13:34:13Z @ThorstenRaab referenced in commit `6d3b103` - "v6.9.12 (#5099)

* LearnNeo.view.home.ContentTreeList: fixed the content path

* LearnNeo cleanup

* NewWebsite.view.MainContainer: scss => fixed the logo path, cleanup

* Added Script Design Token Conversion Script

* data.connection.Xhr: new pages domain

* Added some prose to the stylesheet page

* Styling updates for learning section & theme

* #5094 WIP

* #5094 WIP => no longer relying on putting the base value into a "500" property

* buildScripts/convertDesignTokens => add support for non-token based values containing empty chars #5095

* Styling update to the sidenav

* training content: code view

* LearnNeo.view.home.ContentTreeList: hide the collapse & expand all icons #5096

* Styling changes for the learning section

* Splitter styling updates

* change onHash being async

* reformatted changes

* controller.Base: cleanup

* v6.9.12

---------

Co-authored-by: tobiu <tobiasuhlig78@gmail.com>
Co-authored-by: max.mertens <maxmertens@gmx.de>
Co-authored-by: Max Rahder <rahder@gmail.com>"

