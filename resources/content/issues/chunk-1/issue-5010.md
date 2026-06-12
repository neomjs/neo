---
id: 5010
title: Storybook integration for neo.mjs
state: CLOSED
labels:
  - enhancement
  - help wanted
  - epic
  - no auto close
  - hacktoberfest
assignees: []
createdAt: '2023-10-12T08:46:17Z'
updatedAt: '2026-06-05T17:31:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5010'
author: tobiu
commentsCount: 7
parentIssue: null
subIssues:
  - '[x] 5132 Creating the Storybook framework'
  - '[x] 5133 Creating the neo.mjs renderer for Storybook'
  - '[x] 5134 Creating a first Storybook story to render a neo.mjs button'
subIssuesCompleted: 3
subIssuesTotal: 3
blockedBy: []
blocking: []
closedAt: '2026-06-05T17:31:49Z'
---
# Storybook integration for neo.mjs

We got asked to fully integrate neo (https://github.com/neomjs/neo) into storybook, for making it possible to render neo components inside the harness. @mxmrtns

This is definitely an epic which we need to break down into several stories and tasks.

**What is neo.mjs?**
neo is a next generation frontend framework which fully embraces multithreading for UIs. Everything possible got pulled out of the main thread to get to an incredible rendering performance. As an USP, neo is capable of creating multi window / multi screen apps which can directly communicate (no need for a native shell). The entire neo ecosystem is released under the MIT license.

**To describe the complexity a bit:**
The neo.mjs dev mode is capable of running directly inside browsers with zero compilations or builds. Storybook itself is not capable of doing this, so getting it to work with the neo dev mode is rough (not impossible though). Making it work with the neo `dist/production` output (Webpack based) would be sufficient as a start.

Storybook relies on `render()` implementations which return an html output. I am not sure, if they can be `async` and if they do pass a node id, where a new component is supposed to get dropped into the DOM.

neo in a nutshell: the main thread will generate multiple dedicated or shared workers, especially an app worker which will host apps including component instances. We will need a specific mount adapter inside Storybook which will create the neo setup once(!). We need to start with an empty neo app shell and enhance the main thread a bit more to allow creating neo components / widgets from there (async).

We will need to adjust the Storybook `render()` logic a lot. A huge neo difference when comparing it to e.g. Angular or React is that `render()` in neo will only trigger once for a given component tree (not even for each component). After a component got mounted, state changes will **not** trigger render at all. This makes a lot of sense from a performance perspective, since state changes will directly trigger delta updates from a separate worker.

What we can do from the neo side: We can create the mount adapter & custom rendering logic to provide everything needed to easily integrate neo into 3rd party tools. This part is needed anyway => Cypress, Siesta & Playwright come to mind.

Where we definitely will need help are the "Storybook specifics". The official guide is too vague:
https://storybook.js.org/docs/react/contribute/framework

The boilerplate example looks helpful, but analysing the details will take more time than we have at the moment:
https://github.com/CodeByAlex/storybook-framework-boilerplate

Of course we could walk through other implementations, but it is very different to what we need to create:
https://github.com/storybookjs/storybook/tree/next/code/frameworks

Sticking to the open source idea, it would be highly appreciated to make this topic an community effort. Please give us a heads up in case you are interested in joining. You can ping us inside the neo slack: https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA

Best regards,
Tobias

## Timeline

- 2023-10-12T08:46:17Z @tobiu added the `enhancement` label
- 2023-10-12T08:46:17Z @tobiu added the `help wanted` label
- 2023-10-12T08:46:17Z @tobiu added the `epic` label
### @tobiu - 2023-10-12T10:35:37Z

cross-reference ticket:
https://github.com/storybookjs/storybook/discussions/24452

### @valentinpalkovic - 2023-10-12T11:34:05Z

Hi @tobiu,

One of the Storybook core-maintainers here! :)

Feel free to message me in Discord (vatcoop) if you want to discuss this or need help. In a live session, you may provide me some insights into how neo.js works and how exactly Storybook would have to adapt to make integration possible.

### @tobiu - 2023-10-12T12:40:15Z

Appreciated. Sent you a friend request on discord.

We are actually doing our weekly neo workshop in 20m. You can join for an intro, if you like to (warning, that one is using MS teams,...).

### @tobiu - 2023-12-05T09:21:53Z

Hi @valentinpalkovic, @ExtAnimal, @mxmrtns!

I just created a new GH-project board to better organise this topic: https://github.com/neomjs/neo/projects/37

It will get a priority now.

### @github-actions - 2024-08-29T02:26:33Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:33Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:28:58Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:28:58Z @github-actions closed this issue
- 2024-10-01T22:40:35Z @tobiu removed the `stale` label
- 2024-10-01T22:40:35Z @tobiu added the `no auto close` label
- 2024-10-01T22:40:50Z @tobiu reopened this issue
- 2024-10-01T22:43:50Z @tobiu added the `hacktoberfest` label
- 2024-10-01T22:52:25Z @tobiu cross-referenced by #6000
- 2026-06-05T17:24:01Z @neo-opus-vega added sub-issue #5132
- 2026-06-05T17:24:04Z @neo-opus-vega added sub-issue #5133
- 2026-06-05T17:24:08Z @neo-opus-vega added sub-issue #5134
### @neo-opus-ada - 2026-06-05T17:31:48Z

## Closing as not-planned — operator-directed (@tobiu, 2026-06-05)

Operator: *"i would close it. we can create an own neo playground that supports app workers and json vdom. storybook and neo simply do not fit."*

Decisive architectural call: Storybook's rendering model doesn't fit Neo's multi-threaded **app-worker + JSON-blueprint VDom** architecture — a purpose-built Neo playground (app-worker + JSON-vdom aware) is the right future direction, not a Storybook adapter.

This supersedes the earlier triage read ("keep open + formally link subs"). That read was correct that the intent was *never-natively-linked, not stale* — but the operator's architecture-fit judgment is the deciding factor. Closing #5010 and its subs #5132 / #5133 / #5134 as not-planned. The Neo-playground idea is a separate future exploration (→ `/ideation-sandbox` if/when pursued), not tracked under this epic.


- 2026-06-05T17:31:50Z @neo-opus-ada closed this issue
- 2026-06-05T17:31:52Z @neo-opus-ada cross-referenced by #5132
- 2026-06-05T17:31:54Z @neo-opus-ada cross-referenced by #5133
- 2026-06-05T17:31:55Z @neo-opus-ada cross-referenced by #5134

