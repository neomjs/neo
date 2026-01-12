---
id: 7297
title: Create a Modern 'Getting Started' Guide
state: CLOSED
labels:
  - documentation
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - Mariam-Saeed
createdAt: '2025-09-28T12:48:02Z'
updatedAt: '2025-10-08T13:26:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7297'
author: tobiu
commentsCount: 6
parentIssue: 7296
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-08T13:26:17Z'
---
# Create a Modern 'Getting Started' Guide

## Description

The current `learn/gettingstarted/Workspaces.md` guide is outdated and relies heavily on images, which are not accessible to AI tools or screen readers. 

The goal of this ticket is to create a new, modern guide in the `learn/gettingstarted/` folder to replace it.

### Tasks:

1.  Create a new markdown file (e.g., `learn/gettingstarted/CreatingYourFirstApp.md`).
2.  Write a text-based tutorial that walks a new user through the `npx neo-app` command.
3.  Describe the modern workspace and application folder structure.
4.  Explain the purpose of the key files in a minimal app (`app.mjs`, `MainView.mjs`, etc.).
5.  Ensure all code examples are in text-based, copy-pastable code blocks.

## Timeline

- 2025-09-28T12:48:03Z @tobiu added parent issue #7296
- 2025-09-28T12:48:04Z @tobiu added the `documentation` label
- 2025-09-28T12:48:04Z @tobiu added the `help wanted` label
- 2025-09-28T12:48:04Z @tobiu added the `good first issue` label
- 2025-09-28T12:48:04Z @tobiu added the `hacktoberfest` label
### @Mariam-Saeed - 2025-09-28T13:41:46Z

Hi @tobiu , I'd like to work on this issue.  
Could you please assign it to me?

- 2025-09-28T13:46:05Z @tobiu assigned to @Mariam-Saeed
### @tobiu - 2025-09-28T13:47:06Z

Sure, and thanks for your interest. Make sure to not submit a PR before october 1st, or it would not count for the event.

### @tobiu - 2025-09-29T09:47:47Z

I just finished this one:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md

Hope it helps, in case you want to try out the new "AI Native" workflows.

### @Mariam-Saeed - 2025-09-30T10:36:28Z

Thanks for sharing! I’ll check it out.


### @Mariam-Saeed - 2025-10-01T13:53:46Z

@tobiu, I noticed that there are two ways to create an app:
`npx neo-app` (creates a workspace and an app in one step)
`npm run create-app-minimal `(adds an app to an existing workspace)
The difference I see is that the `create-app-minimal` option generates more starter files inside the `view` folder compared to the `npx neo-app` approach.
Would you recommend highlighting the `create-app-minimal` command when explaining how to add a new app to a workspace, or should we stick with the `npx neo-app` flow?

### @tobiu - 2025-10-01T15:12:15Z

Let me give you some input: there are 2 ways to work with neo: we can create a repo fork, or use `npx neo-app` to create a workspace. The folder structure is super similar: both provide the app, docs, resources and src folders. The main difference is that inside a workspace, neo is a dependency. meaning: it is located inside `node_modules/neo.mjs`. Close to all scripts/programs inside buildScripts are designed to work inside both environments.

So, if someone wanted to create an app and work on the framework in parallel, a fork makes more sense. We can super easily move an app from the repo to a workspace or from a workspace to the repo, with just using a folder-wide regex to adjust the import paths inside .mjs files. For a production deployment of an app, the workspace is better, since bundle sizes get smaller.

Inside the repo or a workspace, we can create more apps using `npm run create-app`. I think @maxrahder created the `create-app-minimal` for a client neo training, which starts with an empty viewport, instead of the dummy tab container.

There is also `npm run create-class`, which is quite smart. E.g. if you have `MyApp.view.Viewport` and use it to create `MyApp.view.ViewportController`, it will not only create the class shell, but also import it into the view and assign it as a config.

To be fair: I have not used most scripts in a while, since I can now just tell Gemini CLI to build and connect new files.

- 2025-10-02T00:06:54Z @Mariam-Saeed cross-referenced by PR #7323
- 2025-10-08T13:26:18Z @tobiu closed this issue

