---
id: 1757
title: 'controller.Component: change the view parsing from a top down to a bottom up approach'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-13T14:12:57Z'
updatedAt: '2021-04-14T15:05:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1757'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-14T15:05:43Z'
---
# controller.Component: change the view parsing from a top down to a bottom up approach

Right now, every component which does get created triggers the `parseConfig()` logic in case it has its own view controller.

For `model.Component` I am using a bottom up approach: Every component triggers the `parseConfig()` logic on the closest view model, not related if it has an own model or not. This means more `parseConfig()` calls, but each call only parses the top level config and does not touch `items`.

I want to apply the same strategy to view controllers.

There are several benefits:

1. We can dynamically add new components including string based listeners and dom listeners, not related to an own vc.
2. We can immediately resolve references and store them inside the vc.
3. Parsing events will get easier: before, the top level config already applied the `core.Observable` mixin, so these listeners got transformed, while this was not the case for `items`.
4. We can resolve string based listeners in a smarter way => finding matches inside the controllers parent chain if needed.

In general I think we can simplify the logic and code size by a lot.

I will create sub tickets as needed, already created a new project.

## Timeline

- 2021-04-13T14:12:57Z @tobiu added the `enhancement` label
- 2021-04-13T14:12:57Z @tobiu assigned to @tobiu
- 2021-04-13T14:16:20Z @tobiu referenced in commit `a974bc9` - "controller.Component: change the view parsing from a top down to a bottom up approach #1757 (in progress)"
- 2021-04-13T14:26:39Z @tobiu referenced in commit `c0e5a87` - "#1757 controller.Component: parseConfig() => removing the array check for listeners (no longer needed, since all listeners got parsed by core.Observable now)"
- 2021-04-13T14:29:12Z @tobiu referenced in commit `95b4cb8` - "#1757 controller.Component: parseConfig() => removing the array check for domListeners (no longer needed)"
- 2021-04-13T14:30:18Z @tobiu cross-referenced by #1736
- 2021-04-13T14:45:31Z @tobiu referenced in commit `c494ee5` - "#1757 controller.Component: parseConfig() => finding dom listeners inside the parent chain if needed"
- 2021-04-13T14:49:55Z @tobiu referenced in commit `4af2601` - "#1757 controller.Component: completely removing the onViewConstructed() logic (no longer needed)"
### @tobiu - 2021-04-14T15:05:43Z

done!

- 2021-04-14T15:05:43Z @tobiu closed this issue

