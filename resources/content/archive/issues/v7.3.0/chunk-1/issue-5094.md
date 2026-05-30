---
id: 5094
title: Design Token conversion script should consider color modifications
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-11-13T17:32:42Z'
updatedAt: '2024-09-12T02:29:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5094'
author: mxmrtns
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:07Z'
---
# Design Token conversion script should consider color modifications

As shown in the link below, the JSON export from Token Studio includes the color modifications made in Figma.

Currently. the script can't interpret this description correctly and outputs incorrect variables.

Feature request:
The conversion script should be able to interpret the color modifications and output the corresponding SCSS variables.

https://github.com/neomjs/neo/blob/92ab05e27b02de30cc5630ce99dbc7a68fd4a61f/resources/design-tokens/json/core.json#L1

Relevant parameter are:

type: darken or lighten
value: 0-1
space: hsl, srgb, p3, lch


## Timeline

- 2023-11-13T17:32:42Z @mxmrtns added the `enhancement` label
- 2023-11-13T18:28:28Z @tobiu referenced in commit `329121e` - "#5094 WIP"
### @tobiu - 2023-11-13T18:29:37Z

pushed a WIP version.

are the real values always inside the "500" key? or can it be anywhere in therory?

first result:
<img width="1186" alt="Screenshot 2023-11-13 at 19 23 08" src="https://github.com/neomjs/neo/assets/1177434/55b77e9b-2e91-4381-8518-238d0ab66265">

i am not sure how to best thread different `space` keys with SCSS

### @tobiu - 2023-11-13T18:45:00Z

@mxmrtns: here is a full list of what we can use with SCSS:
https://sass-lang.com/documentation/modules/color/#darken

e.g. `darken()` is no longer recommended, but `color.scale()` is.

```
@use 'sass:color';

// #036 has lightness 20%, so when darken() subtracts 30% it just returns black.
@debug darken(#036, 30%); // black

// scale() instead makes it 30% darker than it was originally.
@debug color.scale(#036, $lightness: -30%); // #002447
```

- 2023-11-13T22:27:34Z @tobiu referenced in commit `b7afe85` - "#5094 WIP => no longer relying on putting the base value into a "500" property"
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
### @github-actions - 2024-08-29T02:26:18Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:19Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:07Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:07Z @github-actions closed this issue

