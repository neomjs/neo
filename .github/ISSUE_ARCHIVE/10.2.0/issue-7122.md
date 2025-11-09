---
id: 7122
title: 'SharedCovid app: Regression bug => clicking on  a table row throws an error'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-07-29T11:23:48Z'
updatedAt: '2025-07-29T11:44:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7122'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-29T11:44:25Z'
---
# SharedCovid app: Regression bug => clicking on  a table row throws an error

**Reported by:** @tobiu on 2025-07-29

It leads to:

<img width="644" height="247" alt="Image" src="https://github.com/user-attachments/assets/db9c0dc3-6e64-4cf4-88f8-d0045d9bd3d8" />

Selecting a country without clicking on a table row first switches the new country and the previous selection back and forth infinitely. Quite a performance demo, but definitely not intended this way.

## Comments

### @tobiu - 2025-07-29 11:44

I will create a new ticket for the country selection, since it seems not related. The table selections work fine again.

