---
id: 5350
title: 'Portal.view.learn.PageContainer: Footer Button on first page'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - mxmrtns
createdAt: '2024-03-17T13:23:48Z'
updatedAt: '2024-09-12T02:27:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5350'
author: tobiu
commentsCount: 6
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:27:57Z'
---
# Portal.view.learn.PageContainer: Footer Button on first page

Assuming this one should not take the full width, but the last 50%.

<img width="1528" alt="Screenshot 2024-03-17 at 14 21 53" src="https://github.com/neomjs/neo/assets/1177434/2ed73414-4f32-41ac-9257-18568a34406f">


## Timeline

- 2024-03-17T13:23:48Z @tobiu added the `enhancement` label
- 2024-03-17T13:23:49Z @tobiu assigned to @mxmrtns
### @Michael-Nwachukwu - 2024-03-18T15:32:06Z

hey @tobiu, can i work on this?

### @tobiu - 2024-03-18T17:05:08Z

hi @Michael-Nwachukwu!

it depends on how @mxmrtns wants the footer to look like.

the JS code is here: https://github.com/neomjs/neo/blob/dev/apps/portal/view/learn/PageContainer.mjs

the logic is data-driven: in case there is no `previousPageRecord`, the last page button will get the `hidden` config set to true, which then won't render it into the DOM at all.

the related SCSS is here: https://github.com/neomjs/neo/blob/dev/resources/scss/src/apps/portal/learn/MainContainer.scss#L20

a button has `flex: 1` which is fine in case there are 2 buttons, but not so much in case there is just one.

the chicken and egg problem: the ticket is related to the new learning section, which you will need to actually understand how the framework works and more importantly how to use it as a developer. we need around 4 more weeks to publish the new portal app.

you could create a fork, run `npm i`, then `npm run build-all`, then ideally enable the theme watcher: `npm run watch-themes` to get your SCSS compiled into CSS when doing changes. afterwards `npm run server-start` and open the portal app inside the browser.

my recommendation would be: join the slack channel first. @maxrahder is moderating weekly workshops and can help interested devs in getting up to speed.

- 2024-03-18T20:51:31Z @tobiu referenced in commit `699544d` - "#5350 Portal.view.learn.PageContainer: own scss file"
### @Michael-Nwachukwu - 2024-03-19T09:40:35Z

Hi @tobiu can i get a link to the slack channel? I just took a look and i indeed need to understand the framework first. 

### @tobiu - 2024-03-19T12:37:15Z

here is the link: https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA

- 2024-03-26T16:29:48Z @tobiu referenced in commit `ff920c8` - "#5350 Portal.view.learn.PageContainer: own scss file"
### @github-actions - 2024-08-29T02:25:24Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:25:24Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:27:57Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:27:57Z @github-actions closed this issue

