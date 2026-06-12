---
id: 2118
title: Timefield example has validation inconsistent with time picker items
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2021-05-22T20:31:17Z'
updatedAt: '2024-09-16T02:37:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2118'
author: keckeroo
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-16T02:37:04Z'
---
# Timefield example has validation inconsistent with time picker items

**Describe the bug**
Need to update either the picker data or the picker mask so that picker items are valid

**To Reproduce**
Steps to reproduce the behavior:
1. Go to time example
2. select value
3. See error

DeltaUpdates.mjs:166 The specified value "08:05 AM" does not conform to the required format.  The format is "HH:mm", "HH:mm:ss" or "HH:mm:ss.SSS" where HH is 00-23, mm is 00-59, ss is 00-59, and SSS is 000-999.

![Screen Shot 2021-05-22 at 3 31 02 PM](https://user-images.githubusercontent.com/1653769/119240010-becf6380-bb12-11eb-84b4-42733f9d7a81.png)


## Timeline

- 2021-05-22T20:31:17Z @keckeroo added the `bug` label
### @tobiu - 2021-05-22T21:20:24Z

Hi Kevin, I need more input on this one.

![Screenshot 2021-05-22 at 23 19 32](https://user-images.githubusercontent.com/1177434/119241070-3a053980-bb54-11eb-9b6f-af0e9a35a5df.png)

Maybe a local timezone formatting issue? Could be the AM / PM part which is missing for me.


### @keckeroo - 2021-05-22T21:43:23Z

Please review the image posted above. The example picker has am/pm and is probably what is causing the issue.

### @github-actions - 2024-09-02T02:30:19Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-02T02:30:20Z @github-actions added the `stale` label
### @github-actions - 2024-09-16T02:37:04Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-16T02:37:04Z @github-actions closed this issue

