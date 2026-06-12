---
id: 2427
title: 'calendar.view.CalendarsContainer: convert the container into a list'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-20T13:21:34Z'
updatedAt: '2021-06-28T19:37:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2427'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-28T19:37:58Z'
---
# calendar.view.CalendarsContainer: convert the container into a list

Thinking more about this one, a list makes more sense.

We get KeyNav and can select items (calendars). When creating a new event, the selected calendar list item gets the priority.

List items need to include checkbox fields as well as a click to edit icon (only visible on hover).

## Timeline

- 2021-06-20T13:21:34Z @tobiu added the `enhancement` label
- 2021-06-20T13:21:34Z @tobiu assigned to @tobiu
### @tobiu - 2021-06-26T21:18:58Z

more precisely: add a list as a container item.

- 2021-06-26T21:19:49Z @tobiu referenced in commit `60d3346` - "#2427 calendar.view.CalendarsContainer => calendar.view.calendars.Container"
- 2021-06-26T21:22:26Z @tobiu referenced in commit `b5e96f6` - "#2427 calendar.view.CalendarsContainer => calendar.view.calendars.Container (SCSS)"
- 2021-06-26T21:26:31Z @tobiu referenced in commit `24e2440` - "#2427 calendar.view.calendars Readme file"
- 2021-06-26T21:30:57Z @tobiu referenced in commit `cabe933` - "#2427 calendar.view.calendars.List: base class"
- 2021-06-26T21:34:54Z @tobiu referenced in commit `8efb8f8` - "#2427 calendar.view.calendars.Container: added the list as a container item"
- 2021-06-26T21:36:28Z @tobiu referenced in commit `02d7892` - "#2427 calendar.view.calendars.List: class name"
- 2021-06-26T21:58:48Z @tobiu referenced in commit `2370b88` - "#2427 calendar.view.calendars.List: checkbox items"
- 2021-06-26T22:08:56Z @tobiu referenced in commit `c300586` - "#2427 calendar.view.calendars.List: nesting the checkboxes into LI tags"
- 2021-06-26T22:13:04Z @tobiu referenced in commit `1f12c65` - "#2427 calendar.view.calendars.List: list item styling"
- 2021-06-26T22:22:10Z @tobiu referenced in commit `28da4e2` - "#2427 calendar.view.calendars.Container: removed the checkbox fields"
- 2021-06-28T19:37:58Z @tobiu closed this issue

