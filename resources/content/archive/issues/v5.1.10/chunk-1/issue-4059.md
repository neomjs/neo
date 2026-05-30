---
id: 4059
title: new variables for tab-->header-->button.scss
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-02-15T12:57:51Z'
updatedAt: '2023-02-17T08:59:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4059'
author: MRHajari
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-17T08:59:21Z'
---
# new variables for tab-->header-->button.scss


These variables are missing in the theme tab-->header-->button.scss. please add those.
 'tab-button-background-color'     
 'tab-button-background-color-active'    
 'tab-button-background-color-disabled'  
 'tab-button-background-color-hover'   
 'tab-button-gap'         
 'tab-button-height-active'           
 'tab-button-height-disabled'    
  'tab-button-width'     
 'tab-button-padding-active'          
 'tab-button-padding-disabled'   

## Timeline

- 2023-02-15T12:57:51Z @MRHajari added the `enhancement` label
### @tobiu - 2023-02-15T13:45:40Z

i am not sure about `tab-button-width` => a tab should adjust to the width of its content. e.g. inside our forms we have use cases where a tab header only contains a number like `1`, `2`, `3`. if there was a fixed (minimum?) width on theme level, they might get too wide.

we can still change widths on JS level.

thoughts? @mxmrtns

### @tobiu - 2023-02-15T13:48:23Z

actually one more question: can a tab header button `padding` change for different states? i imagine that this could break the layout.

### @MRHajari - 2023-02-15T15:35:39Z

You're right. can we have tab-button-minWidth?

- 2023-02-16T20:16:11Z @tobiu referenced in commit `a6f95c1` - "#4059 tab-button-background-color"
- 2023-02-16T20:20:17Z @tobiu referenced in commit `b6b1a70` - "#4059 tab-button-background-color-active"
- 2023-02-16T20:27:25Z @tobiu referenced in commit `bd1f2cf` - "#4059 tab-button-background-color-active polishing"
- 2023-02-16T20:28:59Z @tobiu referenced in commit `6ed702c` - "#4059 tab-button-background-color-active polishing"
- 2023-02-16T20:39:48Z @tobiu referenced in commit `3ce99da` - "#4059 tab-button-background-color-disabled"
- 2023-02-16T21:25:30Z @tobiu referenced in commit `843d4a8` - "#4059 tab-button-background-color-hover"
- 2023-02-16T21:29:53Z @tobiu referenced in commit `1b4da5d` - "#4059 tab-button-height"
- 2023-02-16T21:36:37Z @tobiu referenced in commit `a983067` - "#4059 tab-button-text-height-pressed"
- 2023-02-16T21:43:50Z @tobiu referenced in commit `1365555` - "#4059 ensuring that tab indicator styles get a prio again"
- 2023-02-16T21:50:11Z @tobiu referenced in commit `2418092` - "#4059 tab-button-height-pressed: support for dock top & bottom"
- 2023-02-16T21:53:09Z @tobiu referenced in commit `4a03113` - "#4059 tab-button-height-pressed: support for dock left & right"
- 2023-02-16T22:02:45Z @tobiu referenced in commit `66d6049` - "#4059 tab.header.Toolbar: fixed sizes for all position to ensure that they don't get "jumpy" when switching the pressed button with a different height / width"
- 2023-02-16T22:03:51Z @tobiu referenced in commit `dd504fa` - "#4059 tab-button-height-pressed: resetted to the default value"
- 2023-02-16T22:08:50Z @tobiu referenced in commit `8961d45` - "#4059 tab-button-padding"
- 2023-02-16T22:10:56Z @tobiu referenced in commit `640c160` - "#4059 tab-button-glyph-color-over => tab-button-glyph-color-hover"
- 2023-02-16T22:26:38Z @tobiu referenced in commit `8837ffc` - "#4059 tab-button-gap"
### @tobiu - 2023-02-17T08:59:21Z

to give you guys an update:
<img width="573" alt="Screenshot 2023-02-16 at 22 44 46" src="https://user-images.githubusercontent.com/1177434/219598857-8168acc2-376a-4b2d-b185-eef6ca1677e5.png">

<img width="558" alt="Screenshot 2023-02-16 at 23 27 07" src="https://user-images.githubusercontent.com/1177434/219598881-a4dcc1bd-af04-46d3-be27-261fe8473f04.png">

<img width="554" alt="Screenshot 2023-02-16 at 23 16 41" src="https://user-images.githubusercontent.com/1177434/219598891-52547b20-de04-4cd6-88bf-4227505cd3e4.png">

<img width="563" alt="Screenshot 2023-02-16 at 23 19 43" src="https://user-images.githubusercontent.com/1177434/219598916-7cb722fa-89fe-47a3-aed1-2675479923fc.png">

some of the variables took quite some effort, since we do have 4 different header positions in place.

drag&drop ops do not honor the potential gap yet, i will create a follow up ticket for this one.

in general: tabs should use one of the button uis (secondary or ghost i guess), so we can define this one inside the `Overwrites.mjs` inside an app.

since tab header buttons are extending button and use their CSS rules, a tab button itself should only contain additional logic on top. so i am not 100% sure if we should keep e.g. background-colors for different states.

- 2023-02-17T08:59:21Z @tobiu closed this issue

