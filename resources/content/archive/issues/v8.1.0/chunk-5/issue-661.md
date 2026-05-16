---
id: 661
title: Add documentation for repository structure
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-06-03T00:08:58Z'
updatedAt: '2020-06-08T15:35:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/661'
author: ticklepoke
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-08T15:35:44Z'
---
# Add documentation for repository structure

**Is your feature request related to a problem? Please describe.**
A quick introduction to how the repository is structured would make it easier for incoming developers to quickly understand the codebase and where to find things. 

**Describe the solution you'd like**
Add documentation to `CONTRIBUTING.md` on what each folder contains.

**Describe alternatives you've considered**
Perhaps add a separate `md` file to explain the repo structure?

**Additional context**
React documentation has a page dedicated to understanding the codebase [here](https://reactjs.org/docs/codebase-overview.html). It explains where to find what you need.


## Timeline

- 2020-06-03T00:08:58Z @ticklepoke added the `enhancement` label
### @tobiu - 2020-06-03T08:26:16Z

some input on my end:

the repo structure should mostly be self explanatory.

## apps
contains demo apps created with the create-app program. i prefer to create new demo apps directly inside the repo, which allows to work on the framework source in parallel. once an app is done i use "npx neo-app" to create a new shell and move it into the neo namespace:
https://github.com/neomjs/

## buildScripts
contains the nodejs based build programs as well as create-app. tooling to create the dist versions  (webpack), themes & docs output. also take a look at https://github.com/neomjs/create-app.

## dist
NOT included inside the repo, will get generated using the build programs (e.g. build-all).

## docs
contains the docs app code as well as the docs output (generated with the generate-docs-json script). the app UI is built using neo.mjs as well. online version for chrome 80+: https://neomjs.github.io/pages/node_modules/neo.mjs/docs/index.html. especially the API section is really helpful to get an idea about the class hierarchy.

## examples
contains examples of various UI components. many of them got added into the docs app (examples section)

## node_modules
NOT included inside the repo, will get generated using npm install

## resources
mostly the scss files for the 2 neo themes & structure.

## test
Siesta based unit & user interaction tests. This part needs more love for sure.

### @ticklepoke - 2020-06-06T10:22:46Z

Hey @tobiu, I created an initial draft for some [documentation](https://github.com/ticklepoke/neo/blob/documentation/.github/CODEBASE_OVERVIEW.md). Would be great if you could provide some comments. 

### @tobiu - 2020-06-06T15:39:25Z

Hi Nigel,

thanks for writing this one. Feel free to send a PR and we can add it plus
create a link to it from the main readme.
I am still half asleep from writing todays blog :)

I would adjust a couple of things: e.g. the create-app program inside the
repo is not related to the create-app repository :)
1) create-app within the repo creates an app shell inside the app folder
2) the create-app repo is for "npx neo-app" which creates a new workspace
folder anywhere you want to using neo.mjs as a node module.

We can polish it a bit more after the PR.

Thanks & best regards,
Tobias

On Sat, Jun 6, 2020 at 12:22 PM Nigel Lee <notifications@github.com> wrote:

> Hey @tobiu <https://github.com/tobiu>, I created an initial draft for
> some documentation
> <https://github.com/ticklepoke/neo/blob/documentation/.github/CODEBASE_OVERVIEW.md>.
> Would be great if you could provide some comments.
>
> —
> You are receiving this because you were mentioned.
> Reply to this email directly, view it on GitHub
> <https://github.com/neomjs/neo/issues/661#issuecomment-640031500>, or
> unsubscribe
> <https://github.com/notifications/unsubscribe-auth/AAI7OWVG3XG6F5Y6PMSJZQDRVIKIFANCNFSM4NRFXS5Q>
> .
>


- 2020-06-08T15:35:44Z @tobiu closed this issue

