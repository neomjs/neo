---
id: 3604
title: 'neo theme files: auto-generate css vars'
state: CLOSED
labels:
  - enhancement
  - good first issue
  - stale
assignees: []
createdAt: '2022-12-15T22:40:11Z'
updatedAt: '2024-09-14T02:26:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3604'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:38Z'
---
# neo theme files: auto-generate css vars

we do have boilerplate code inside our theme files:
```
$neoMap: map-merge($neoMap, (
    'boxlabel-background-color': #323232,
    'boxlabel-border'          : 0,
    'boxlabel-color'           : #ddd
));

@if $useCssVars == true {
    :root .neo-theme-dark { // .neo-box-label
        --boxlabel-background-color: #{neo(boxlabel-background-color)};
        --boxlabel-border          : #{neo(boxlabel-border)};
        --boxlabel-color           : #{neo(boxlabel-color)};
    }
}
```

we should check if the build **and** watch-themes scripts could auto-generate the part inside the if statement.

## Timeline

- 2022-12-15T22:40:11Z @tobiu added the `enhancement` label
### @tobiu - 2022-12-15T22:40:24Z

@maxrahder 

- 2022-12-15T22:42:31Z @tobiu added the `good first issue` label
### @tobiu - 2022-12-15T22:43:03Z

added the good first issue label, since this ticket does not require any knowledge about the framework.

### @github-actions - 2024-08-30T02:27:36Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:36Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:37Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:38Z @github-actions closed this issue

