---
id: 262
title: Which apps are *not* appropriate for Neo?
state: CLOSED
labels:
  - QA
assignees: []
createdAt: '2020-03-09T15:06:47Z'
updatedAt: '2020-03-09T15:08:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/262'
author: chexxor
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-09T15:06:51Z'
---
# Which apps are *not* appropriate for Neo?

For future people who search for this question, logging the Q&A here for their benefit. Originally from: https://www.reddit.com/r/Frontend/comments/febrmh/contributors_wanted_multithreading_ui_framework/fjog3zb/

**chexxor**: What projects are *not* appropriate to use this framework?

**TobiasUhlig**: not sure if i understand the question. the framework is MIT licensed, so every project which wants to use it can do so.

from a technical perspective, projects where performance matters should take a look into neo.mjs. i would probably not use it for static websites, although it is possible.

i personally like the architecture (class enhancements & controllers) a lot, so for me it is time-saving to use neo. to be fair, there is a learning curve to get up to speed, but once you do get familiar with the JSON based vdom, you most likely are going to love it.

**chexxor**: After reading my question again, yeah it can be an ambiguous question.

I like to ask this question after using the the Elm architecture in a place where it wasn't appropriate -- I tried to make a multi-page website in that architecture, and it proved impossible for me to after-the-fact add lazy-loading pages to it in the language I was using. After that happened, I decided it was odd that the Elm website only discusses how great it is while being silent on the situations in which it is not appropriate to use the architecture.

So, the purpose of my question was to ensure that people don't use the framework in a way that they will later be "burned" by deciding to use it. I have come to believe it's polite to guide people using your tool in a way to ensure they don't misuse it.

**TobiasUhlig**: My opinion on multi-page sites is probably pretty unique, although this will change soon. The main argument to not do it is that each page needs to load & initialise a framework. Even with caching there is a performance impact (at the minimum the initialisation).

However, with shared workers around the corner, this can change. imagine multiple pages sharing the app, data & vdom worker and different main threads connecting to it. this would eliminate the overhead and make all components reusable.

Without shared workers, you need to ask yourself the question, if the framework makes sense: e.g. if you like specific components / architecture benefits, if the overhead is worth it etc. (the framework does try to only load / build what it needs, but still). In case some pages need a lot of dynamic changes or are complex, it could make sense. hard to tell without having more details :)

## Timeline

- 2020-03-09T15:06:51Z @chexxor closed this issue
- 2020-03-09T15:08:39Z @tobiu added the `QA` label

