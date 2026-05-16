---
id: 4057
title: 'button.Base: UIs and variables'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-02-15T11:32:15Z'
updatedAt: '2024-09-12T02:29:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4057'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:34Z'
---
# button.Base: UIs and variables

@mxmrtns @Dinkh @deniztoprak @maxrahder 

we do have 4 UIs in place now, but the styling (the values) do not match the specs yet. i also think that we can most likely reduce the amount of variables quite a bit.

assuming that i understood max (m) correctly, let us take a quick look into the different UIs inside the github platform.

primary:
<img width="163" alt="Screenshot 2023-02-15 at 11 48 01" src="https://user-images.githubusercontent.com/1177434/219015544-160d1e0c-8610-4d09-a188-018cc7533d7c.png">

secondary: (mostly used inside neo so far)
<img width="138" alt="Screenshot 2023-02-15 at 12 30 03" src="https://user-images.githubusercontent.com/1177434/219015746-db3f7590-a7ef-40bd-abd8-ec7e087279d5.png">

tertiary: (just looking like a link, no effects)
<img width="121" alt="Screenshot 2023-02-15 at 12 30 21" src="https://user-images.githubusercontent.com/1177434/219016008-a4fd3235-01df-45d2-9b54-ea6095da12fc.png">

ghost: (looks like text, but gets a background effect or border on hover, pressed, focus)
<img width="303" alt="Screenshot 2023-02-15 at 12 30 16" src="https://user-images.githubusercontent.com/1177434/219015816-c399995d-8757-4119-aab2-8bd738376b28.png">

@mxmrtns is this correct?


## Timeline

- 2023-02-15T11:32:15Z @tobiu added the `enhancement` label
### @mxmrtns - 2023-02-15T12:57:10Z

@tobiu Yes, thats correct!

### @github-actions - 2024-08-29T02:27:36Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:36Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:34Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:34Z @github-actions closed this issue

