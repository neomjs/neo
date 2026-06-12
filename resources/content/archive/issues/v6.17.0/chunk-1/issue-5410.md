---
id: 5410
title: Neo.apps.Colors
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-06-06T22:33:18Z'
updatedAt: '2024-06-17T23:26:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5410'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-17T23:26:29Z'
---
# Neo.apps.Colors

We need a new multi window example to showcase rapid dom updates across multiple windows.

the idea is to create a table, bar chart & pie chart which can get detached from the main viewport into new windows. 

## Timeline

- 2024-06-06T22:33:18Z @tobiu added the `enhancement` label
- 2024-06-06T22:33:19Z @tobiu assigned to @tobiu
- 2024-06-06T22:34:59Z @tobiu referenced in commit `af5dab7` - "Neo.apps.Colors #5410"
### @tobiu - 2024-06-06T22:35:24Z

First version:
<img width="1057" alt="Screenshot 2024-06-06 at 23 58 39" src="https://github.com/neomjs/neo/assets/1177434/d7984e46-1a2c-47dc-beb1-d7adb91c67fe">

- 2024-06-06T22:49:24Z @tobiu referenced in commit `f7f889c` - "#5410 Colors.view.ViewportController: generateData() => added the id field"
- 2024-06-06T22:53:16Z @tobiu referenced in commit `f0e6d25` - "#5410 Colors.view.ViewportController: generateData() => added the id field cleanup"
- 2024-06-06T23:17:43Z @tobiu referenced in commit `c6f4326` - "#5410 Colors.view.ViewportController: polished the table delta updates"
- 2024-06-07T16:18:30Z @tobiu referenced in commit `4bb84e2` - "#5410 Colors.view.TableContainer: index column"
- 2024-06-07T19:24:17Z @tobiu referenced in commit `1687dfc` - "#5410 Colors.view.PieChartComponent"
- 2024-06-07T21:01:09Z @tobiu referenced in commit `4de9277` - "#5410 Colors.view.ViewportController: logic to update the summary pie chart. TableContainer: layout improvements"
- 2024-06-08T14:11:42Z @tobiu referenced in commit `de07614` - "#5410 new childapp shell for detaching widgets"
- 2024-06-08T15:13:33Z @tobiu referenced in commit `b3f67a9` - "#5410 logic to move the Table into a new browser window"
- 2024-06-08T17:17:45Z @tobiu referenced in commit `bf421db` - "#5410 Colors.view.Viewport: scss file, styling"
- 2024-06-08T17:24:17Z @tobiu referenced in commit `d012cf5` - "#5410 Colors.view.ViewportController: disabling / enabling the detach table button when moving the widget across windows"
- 2024-06-08T17:25:39Z @tobiu referenced in commit `9a15905` - "#5410 Colors.view.ViewportController: cleanup"
- 2024-06-09T11:56:26Z @tobiu referenced in commit `7b0d05a` - "#5410 Colors.view.ViewportController: onAppConnect() => index map for widgets"
- 2024-06-09T12:13:28Z @tobiu referenced in commit `4be70d8` - "#5410 Colors.view.ViewportController: detaching & re-adding the pie chart"
- 2024-06-09T12:27:41Z @tobiu referenced in commit `e7e2e79` - "#5410 component.wrapper.AmChart: passing the windowId to all remote method calls"
- 2024-06-09T19:02:59Z @tobiu referenced in commit `e200ebf` - "#5410 Colors.view.BarChartComponent"
- 2024-06-09T19:24:45Z @tobiu referenced in commit `aabdb6b` - "#5410 Colors app: increased the loadApplicationDelay to 100ms for child apps"
- 2024-06-09T19:28:26Z @tobiu referenced in commit `b185074` - "#5410 Colors.view.Viewport: header toolbar styling (scss)"
- 2024-06-09T19:31:28Z @tobiu referenced in commit `9f36a5a` - "#5410 Colors.view.Viewport: header toolbar => no flex value"
- 2024-06-09T19:35:09Z @tobiu referenced in commit `2b85a56` - "#5410 Colors.view.ViewportController: createPopupWindow() => args simplification"
- 2024-06-09T20:22:04Z @tobiu referenced in commit `2984a55` - "#5410 polishing"
- 2024-06-09T20:24:31Z @tobiu referenced in commit `9bb7ad5` - "#5410 Colors.view.Viewport: header toolbar button order"
- 2024-06-10T10:55:29Z @tobiu referenced in commit `c69c1c5` - "#5410 blank line at the end of the index.html file"
### @tobiu - 2024-06-17T23:26:29Z

implementation is finished: https://github.com/neomjs/multiwindowcolors

- 2024-06-17T23:26:29Z @tobiu closed this issue
- 2024-06-19T20:46:25Z @tobiu referenced in commit `05a15bf` - "Neo.apps.Colors #5410"
- 2024-06-19T20:46:25Z @tobiu referenced in commit `9886f05` - "#5410 Colors.view.ViewportController: generateData() => added the id field"
- 2024-06-19T20:46:25Z @tobiu referenced in commit `6bcc0a1` - "#5410 Colors.view.ViewportController: generateData() => added the id field cleanup"
- 2024-06-19T20:46:25Z @tobiu referenced in commit `91a0fea` - "#5410 Colors.view.ViewportController: polished the table delta updates"
- 2024-06-19T20:46:25Z @tobiu referenced in commit `8271b68` - "#5410 Colors.view.TableContainer: index column"
- 2024-06-19T20:46:25Z @tobiu referenced in commit `85f72d7` - "#5410 Colors.view.PieChartComponent"
- 2024-06-19T20:46:25Z @tobiu referenced in commit `f6cff65` - "#5410 Colors.view.ViewportController: logic to update the summary pie chart. TableContainer: layout improvements"
- 2024-06-19T20:46:25Z @tobiu referenced in commit `ca7d9a3` - "#5410 new childapp shell for detaching widgets"
- 2024-06-19T20:46:25Z @tobiu referenced in commit `4e6865a` - "#5410 logic to move the Table into a new browser window"
- 2024-06-19T20:46:26Z @tobiu referenced in commit `19dcba8` - "#5410 Colors.view.Viewport: scss file, styling"
- 2024-06-19T20:46:26Z @tobiu referenced in commit `1da6f73` - "#5410 Colors.view.ViewportController: disabling / enabling the detach table button when moving the widget across windows"
- 2024-06-19T20:46:26Z @tobiu referenced in commit `a4963dd` - "#5410 Colors.view.ViewportController: cleanup"
- 2024-06-19T20:46:26Z @tobiu referenced in commit `6ac91df` - "#5410 Colors.view.ViewportController: onAppConnect() => index map for widgets"
- 2024-06-19T20:46:26Z @tobiu referenced in commit `b4a5342` - "#5410 Colors.view.ViewportController: detaching & re-adding the pie chart"
- 2024-06-19T20:46:26Z @tobiu referenced in commit `5eada72` - "#5410 component.wrapper.AmChart: passing the windowId to all remote method calls"
- 2024-06-19T20:46:26Z @tobiu referenced in commit `66ebc0a` - "#5410 Colors.view.BarChartComponent"
- 2024-06-19T20:46:27Z @tobiu referenced in commit `214344e` - "#5410 Colors app: increased the loadApplicationDelay to 100ms for child apps"
- 2024-06-19T20:46:27Z @tobiu referenced in commit `dbfd36f` - "#5410 Colors.view.Viewport: header toolbar styling (scss)"
- 2024-06-19T20:46:27Z @tobiu referenced in commit `819de77` - "#5410 Colors.view.Viewport: header toolbar => no flex value"
- 2024-06-19T20:46:27Z @tobiu referenced in commit `73e6a87` - "#5410 Colors.view.ViewportController: createPopupWindow() => args simplification"
- 2024-06-19T20:46:27Z @tobiu referenced in commit `a38b71b` - "#5410 polishing"
- 2024-06-19T20:46:27Z @tobiu referenced in commit `11ae015` - "#5410 Colors.view.Viewport: header toolbar button order"
- 2024-06-19T20:46:27Z @tobiu referenced in commit `5c1528e` - "#5410 blank line at the end of the index.html file"

