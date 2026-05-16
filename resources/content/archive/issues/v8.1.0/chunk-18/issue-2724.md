---
id: 2724
title: Improve README and Documentation
state: CLOSED
labels:
  - help wanted
  - stale
assignees: []
createdAt: '2021-09-07T15:28:36Z'
updatedAt: '2024-09-15T02:36:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2724'
author: cesars-gh
commentsCount: 5
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T02:36:26Z'
---
# Improve README and Documentation

# What is the issue about
Right now, the project lacks of clear documentation for developers interested in the framework. The information about the framework is spread among GitHub pages and articles at Medium.

For instance, the README file is not very clear on "what exactly is neo.mjs" and "why it is needed". This might be obvious for people already involved in the project but not for new developers interested.

# How can we solve it
We already have a lot of information that @tobiu has written so maybe we just need to organize it a bit more.
The goal is to provide a fun on-boarding experience for new devs and generally, people interested in the project.



## Timeline

### @tobiu - 2021-09-10T22:02:26Z

definitely agree on this one.

one part which i want to add is the "no templates" topic:

using templates, we need to create the "union" of all possible states, while in neo we do create the "intersection" instead.

it creates a small overhead for simple components, but the more state related props get in there, the bigger the advantage.

- 2021-09-10T22:02:35Z @tobiu added the `help wanted` label
- 2021-09-16T19:05:36Z @cesars-gh cross-referenced by PR #2729
### @chancesmith - 2021-09-20T00:26:26Z

I agree with @cesar-ibr. The thought leadership is there 💪, but it is a rough onboarding. So far, the dopamine has come from the medium posts by you, @tobiu. My interest is growing, but haven't cloned the repo just yet.

### @tobiu - 2021-09-20T06:54:07Z

@chancesmith: Definitely join the Slack Channel, in case you have not done this already ;)

The main readme should become like an elevator pitch, strongly focussing on the client benefits => why you should use neo.

We should also reduce the size of the main readme, but this requires to get a new learning section ready first.

Ideally, we create new markdown files inside the repo (.github folder) and also include them inside the docs app.

Topics could be:

- Class config system
- Constructing virtual dom
- Component trees
- Remotes API (remote method access)
- main thread addons
- view models
- view controllers
- more examples on how to create apps (we do have a new version of the covid app tutorial (latest blog post), but this is not enough

Best regards,
Tobias

### @github-actions - 2024-08-31T02:26:22Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-31T02:26:23Z @github-actions added the `stale` label
### @github-actions - 2024-09-15T02:36:26Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-15T02:36:26Z @github-actions closed this issue

