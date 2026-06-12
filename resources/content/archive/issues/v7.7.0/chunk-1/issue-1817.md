---
id: 1817
title: Rewrite "How to create a webworkers driven multithreading App — Part 1"
state: CLOSED
labels:
  - Blog Post
  - stale
assignees:
  - tobiu
createdAt: '2021-04-19T08:29:49Z'
updatedAt: '2024-09-18T02:28:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1817'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-18T02:28:40Z'
---
# Rewrite "How to create a webworkers driven multithreading App — Part 1"

The the latest framework & ecosystem enhancements contain several changes and improvements.

The "getting up to speed" blog post needs a new version to reflect them.

Old article (friends link):
https://medium.com/swlh/how-to-create-a-webworkers-driven-multithreading-app-part-1-fa0cc78a4237?source=friends_link&sk=a10ca85002f5f9c3ee8c69f53c79d95f

E.g. the starting point for apps did change:

old:
```Javascript
import MainContainer from './view/MainContainer.mjs';

Neo.onStart =() => {
    Neo.app({
        appPath : 'apps/covid/',
        mainView: MainContainer,
        name    : 'Covid'
    });
};
```

new:
```Javascript
import MainContainer from './view/MainContainer.mjs';

const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'Covid'
});

export {onStart as onStart};
```

The new article should contain more gists instead of screenshots.

Unfortunately, this is a lot of work, since we need to set up a new repo and match the commits with the new blog post.

Rough estimate: 1 full day.

## Timeline

- 2021-04-19T08:29:49Z @tobiu added the `Blog Post` label
- 2021-04-19T08:29:49Z @tobiu assigned to @tobiu
### @github-actions - 2024-09-03T02:26:58Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-03T02:26:59Z @github-actions added the `stale` label
### @github-actions - 2024-09-18T02:28:40Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-18T02:28:40Z @github-actions closed this issue

