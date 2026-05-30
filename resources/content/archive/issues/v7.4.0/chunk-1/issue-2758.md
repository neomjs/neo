---
id: 2758
title: Consider using the window placement API?
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2021-11-30T15:09:57Z'
updatedAt: '2024-09-15T02:36:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2758'
author: LifeIsStrange
commentsCount: 6
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T02:36:23Z'
---
# Consider using the window placement API?

https://web.dev/multi-screen-window-placement/
It would be nice to remember window position

## Timeline

- 2021-11-30T15:09:57Z @LifeIsStrange added the `enhancement` label
### @tobiu - 2021-11-30T21:34:59Z

Hi @LifeIsStrange,

I actually chatted about this topic with the author Thomas ( @tomayac ) a while ago on Twitter. I definitely like the API, except for being limited to Chromium at that point in time (did this change?).

Sadly, both of us have not found the time yet to create a PoC version & demo.

Implementation-wise it should be pretty straight forward. We need a new optional main thread addon, similar to the ones here: https://github.com/neomjs/neo/tree/dev/src/main/addon and create methods which honor the API and expose these as remotes (remote method access) to the App worker.

In case someone wants to create a PR, it would be appreciated.

Best regards,
Tobias

### @tomayac - 2021-12-01T12:07:03Z

(FYI @michaelwasserman and @quisquous.)

### @michaelwasserman - 2021-12-15T19:48:43Z

Thanks for your interest! Chromium is wrapping up the second Origin Trial in M-96 and would appreciate any feedback before pursuing a stable release. See the [explainer](https://github.com/webscreens/window-placement/blob/main/EXPLAINER.md) and/or [draft spec](https://webscreens.github.io/window-placement/) for API details. Feel free to file github issues, leave [feedback](https://github.com/webscreens/window-placement/issues/67), or reach out with any questions. Developer feedback and support motivates other browser vendors to consider adopting APIs like this.

### @LifeIsStrange - 2021-12-15T20:15:12Z

@tobiu to be clear I have not the time/will to implement the feature although I am curious about this API 

### @github-actions - 2024-08-31T02:26:20Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-31T02:26:20Z @github-actions added the `stale` label
### @github-actions - 2024-09-15T02:36:23Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-15T02:36:24Z @github-actions closed this issue

