---
id: 1964
title: 'main.addon.Stylesheet: addGlobalCss(), addThemeFiles() => adjust the content matching useCssVars'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-06T08:48:04Z'
updatedAt: '2021-05-06T08:48:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1964'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-06T08:48:29Z'
---
# main.addon.Stylesheet: addGlobalCss(), addThemeFiles() => adjust the content matching useCssVars

in case `useCssVars === false`, we must only use the first theme.

addGlobalCss() must not include a global source file (src does not exist for this env)

## Timeline

- 2021-05-06T08:48:04Z @tobiu added the `enhancement` label
- 2021-05-06T08:48:04Z @tobiu assigned to @tobiu
- 2021-05-06T08:48:27Z @tobiu referenced in commit `96140ca` - "main.addon.Stylesheet: addGlobalCss(), addThemeFiles() => adjust the content matching useCssVars #1964"
- 2021-05-06T08:48:30Z @tobiu closed this issue

