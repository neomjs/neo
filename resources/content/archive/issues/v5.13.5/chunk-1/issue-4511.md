---
id: 4511
title: Make border !important
state: CLOSED
labels: []
assignees: []
createdAt: '2023-06-19T16:05:33Z'
updatedAt: '2023-07-31T22:09:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4511'
author: mxmrtns
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-31T22:09:18Z'
---
# Make border !important

https://github.com/neomjs/neo/blob/63bc6a6a00b069733f11c69645b5b0d17000ff83/resources/scss/src/button/Base.scss#LL159C3-L159C3

The border property from the ghost button is currently overwritten by the border from .neo-button:active

## Timeline

- 2023-06-19T16:22:24Z @mxmrtns changed title from **Change border to outline** to **Make border !important**
### @mxmrtns - 2023-07-31T17:56:41Z

@tobiu This is till an issue for every button style that does not want to use a border (in my case tertiary and ghost). 

Is it possible to remove the "!important" from the[ default active state](https://github.com/neomjs/neo/blob/63bc6a6a00b069733f11c69645b5b0d17000ff83/resources/scss/src/button/Base.scss#L103)? 


`    &:active {
border : v(button-border-active) !important;
`
change to → 
`    &:active {
border : v(button-border-active) ;
`

### @tobiu - 2023-07-31T22:07:07Z

hi max! this ticket fell under the radar :)

i think the `!important` was intended to give the active boder a prio over error css (e.g. a red border). need to double-check if we can remove it without breaking this order.

however, you are right: only the primary ui has the important flag, all others don't. so we could also just add the flag into the other uis and should be good.

- 2023-07-31T22:08:48Z @tobiu referenced in commit `474c4b3` - "Make border !important #4511"
### @tobiu - 2023-07-31T22:09:18Z

let's try, if this quick-fix already does the trick. if not, we can re-open the issue.

- 2023-07-31T22:09:18Z @tobiu closed this issue

