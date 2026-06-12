---
id: 5976
title: 'Write a Blog Post about Neo.mjs, number 2'
state: CLOSED
labels:
  - help wanted
  - good first issue
  - Blog Post
  - hacktoberfest
assignees:
  - HTSagara
createdAt: '2024-09-27T17:32:08Z'
updatedAt: '2024-11-02T13:01:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5976'
author: tobiu
commentsCount: 6
parentIssue: 6012
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-02T13:01:05Z'
---
# Write a Blog Post about Neo.mjs, number 2

Related to: https://github.com/neomjs/neo/issues/5963 (Please read this ticket first)

Let us start with a "non-technical contribution" ticket for the #hacktoberfest event.

Since this project is still fairly unknown to the developer community, it would be super highly appreciated in case some of you could write blog posts.

Freedom of choice on which platform you write (e.g. Medium, Dev.to).
Also complete freedom of choice about which areas of the framework or your experience with it you want to write.
Once done, make sure to open a PR to get your hacktoberfest credits and ideally share a friends link to your article (if applicable).
In case this is ok for you, we would like to add good blog posts to our official blog link section:
https://neomjs.com/dist/production/apps/portal/#/blog

Thank you in advance,
Tobias

## Timeline

- 2024-09-27T17:32:08Z @tobiu added the `help wanted` label
- 2024-09-27T17:32:08Z @tobiu added the `good first issue` label
- 2024-09-27T17:32:08Z @tobiu added the `hacktoberfest` label
### @HTSagara - 2024-09-30T13:45:19Z

Hello, can I have this issue assigned to me?

### @tobiu - 2024-09-30T14:50:38Z

sure thing. thx!

- 2024-09-30T14:50:49Z @tobiu assigned to @HTSagara
- 2024-10-03T14:29:04Z @tobiu added the `Blog Post` label
### @HTSagara - 2024-10-04T12:19:45Z

Hello @tobiu I just finished writing my [blog post](https://dev.to/htsagara/neomjs-a-high-performance-open-source-javascript-framework-739). I was wondering if I could list it inside the neo [blog section](https://github.com/neomjs/neo/blob/dev/apps/portal/resources/data/blog.json) and submit a PR.


### @tobiu - 2024-10-04T20:09:52Z

yes, of course. i added an instruction on how this works inside the parent ticket: https://github.com/neomjs/neo/issues/6012 (top-level item, the 2 h2 sections).

regarding the npx script: it has 2 dimensions => adding program options inside the terminal as well as the terminal questions. i was thinking to just remove the main thread addons & service worker questions this weekend, since they are definitely confusing for first time users.

workers: the charming part is that neo is not only using workers, but that the app worker is fully in charge (we could call it being the main actor (actor model) or main orchestrator. so apps & components live there and the main thread only applies delta updates to the real DOM and delegates UI events to the app worker. main has no clue which apps or components exists. this design is called OMT (off the main thread).

- 2024-10-07T15:10:50Z @HTSagara referenced in commit `7cedc12` - "issue #5976 blog post"
- 2024-10-07T20:36:26Z @tobiu referenced in commit `38727d6` - "issue #5976 blog post"
### @tobiu - 2024-10-12T16:54:21Z

off topic: @HTSagara: i just added the simplification change for the create-app program inside the repo as well as for the npx generator.

![Image](https://github.com/user-attachments/assets/17214ae1-b760-4d66-b847-acbdcc5d1495)

https://github.com/neomjs/neo/issues/6028

i hope it is less confusing now.

### @tobiu - 2024-11-02T13:01:05Z

Since the event has ended, i will close all hacktoberfest related tickets now. In case someone still wants to work on a related ticket, feel free to add a comment and we can reopen it.

- 2024-11-02T13:01:05Z @tobiu closed this issue

