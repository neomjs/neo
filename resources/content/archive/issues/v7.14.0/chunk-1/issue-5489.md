---
id: 5489
title: Webpack creates wrong bundles (harmony) which can load & instanciate singletons multiple times
state: CLOSED
labels:
  - bug
  - help wanted
  - stale
assignees: []
createdAt: '2024-06-26T13:45:00Z'
updatedAt: '2024-10-10T02:33:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5489'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-10-10T02:33:37Z'
---
# Webpack creates wrong bundles (harmony) which can load & instanciate singletons multiple times

i did not see it before using our `LivePreview` which dynamically imports apps which can dynamically import other modules.

sadly this is a "game over" for our dist/development & dist/production env.

imho we do not need harmony these days anyway => browsers and node are capable of using real JS modules.

![Screenshot 2024-06-26 at 15 09 57](https://github.com/neomjs/neo/assets/1177434/f61c3829-07ae-419c-8f2a-68b9d3d9c66a)

<img width="1143" alt="Screenshot 2024-06-26 at 15 14 47" src="https://github.com/neomjs/neo/assets/1177434/61fc9a86-1d94-4b83-a29e-137daadee038">

<img width="1127" alt="Screenshot 2024-06-26 at 15 15 15" src="https://github.com/neomjs/neo/assets/1177434/e5213eec-23c5-4a6c-ab56-1b54350ba92a">

<img width="965" alt="Screenshot 2024-06-26 at 15 15 40" src="https://github.com/neomjs/neo/assets/1177434/de60ae16-9432-4fa9-9ef0-e9a19e82ac9d">

@sokra

## Timeline

- 2024-06-26T13:45:00Z @tobiu added the `bug` label
- 2024-06-26T16:00:14Z @tobiu added the `help wanted` label
### @tobiu - 2024-06-26T16:01:03Z

steps to reproduce:
* clone the repo
* npm i
* npm run build threads => app => development (or alternatively npm run build-all)

### @tobiu - 2024-06-27T09:02:04Z

i stepped more through the build logic and the new trouble-maker obviously is the LivePreview component.

<img width="598" alt="Screenshot 2024-06-27 at 10 51 06" src="https://github.com/neomjs/neo/assets/1177434/87d34ec5-837f-46d2-a3be-6d4c20602694">

it makes sense: we have a string, which can change in any possible way at run-time, which then gets parsed (replacing static with dynamic imports) and then converted into JS.

IF the previews were readOnly, we could probably monkey-patch it (magic comments to ignore our custom logic and telling build-tools exactly what to import instead)

otherwise, the LivePreview is limited to the dev mode.

This still does not justify though that Webpack sneaks in singletons more than once.

### @github-actions - 2024-09-26T02:32:41Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-26T02:32:42Z @github-actions added the `stale` label
### @github-actions - 2024-10-10T02:33:37Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-10-10T02:33:37Z @github-actions closed this issue

