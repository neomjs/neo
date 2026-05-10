---
id: 7283
title: Convert functional/HtmlTemplateComponent.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - erbierc
createdAt: '2025-09-27T13:55:24Z'
updatedAt: '2025-10-10T14:30:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7283'
author: tobiu
commentsCount: 12
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-08T17:55:50Z'
---
# Convert functional/HtmlTemplateComponent.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `functional/HtmlTemplateComponent.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/functional/HtmlTemplateComponent.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/functional/HtmlTemplateComponent.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T13:55:26Z @tobiu added the `enhancement` label
- 2025-09-27T13:55:26Z @tobiu added parent issue #7262
- 2025-10-02T19:24:57Z @tobiu added the `help wanted` label
- 2025-10-02T19:24:57Z @tobiu added the `good first issue` label
- 2025-10-02T19:24:57Z @tobiu added the `hacktoberfest` label
### @erbierc - 2025-10-03T11:43:44Z

I'd like to contribute :)

### @tobiu - 2025-10-03T16:17:05Z

Hi and thanks for your interest. For the testing tickets, I strongly recommend trying out the “ai native” workflow.

I would read the hacktoberfest intro first:
https://github.com/neomjs/neo/issues/7296

Then the following 2 guides:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

E.g. gemini cli should be capable to complete it on its own.

- 2025-10-03T16:17:11Z @tobiu assigned to @erbierc
### @erbierc - 2025-10-08T12:16:52Z

I have mostly completed this task, the only thing left is to check if the Gemini output is correct - the tests are passing.

### @tobiu - 2025-10-08T12:24:31Z

Thx for the heads-up, and feel free to send the PR => i will let gemini double-check it anyway. How was your experience with the ai workflow? still work in progress, and it should become a lot better, once the MCP-server epic is finished.

### @erbierc - 2025-10-08T12:34:11Z

I actually had a problem (managed to finish the task anyway), where when I wanted to use chroma related scripts, I'd get an error: "Unsupported Windows architecture: x64. Only ARM64 is supported".  I got around it using WSL but without full functionality, that's why I kinda wanted to try one more time before sending a PR, using a virtual machine with Linux on it and making sure I got the full experience!

### @tobiu - 2025-10-08T12:37:24Z

interesting. i think the MCP servers (express => node) as wrappers around chroma will resolve it => https://github.com/neomjs/neo/issues/7399 . if there are specific operations you want to use on chroma, which are not part of the API specs, feel free to create a follow-up ticket for the new epic.

### @erbierc - 2025-10-08T17:06:33Z

I have created a PR: #7420 

- 2025-10-08T17:07:39Z @erbierc cross-referenced by PR #7420
- 2025-10-08T17:51:35Z @tobiu referenced in commit `bf777ce` - "#7283 minor cleanup"
### @tobiu - 2025-10-08T17:55:50Z

Input from Gemini:

> ✦ Hi @erbierc ,
> 
>   Thanks again for your excellent work on PR #7420! We've successfully merged it.
> 
>   As a quick follow-up and learning opportunity, we've just pushed a couple of small polish items to the test file you created. You can see the changes in this commit: https://github.com/neomjs/neo/commit/bf777ce1b31882a70b7bf845abae07254ef8bd34
> 
>   What we changed:
>    1. We replaced the manual Neo.config setup with a call to our centralized setup() helper function.
>    2. We added an "intent-driven" JSDoc comment block at the top of the test suite.
> 
>   Why we changed it:
>    1. Your manual setup was perfectly correct. However, for the new Playwright test suite, we have a shared helper
>       (test/playwright/setup.mjs) to reduce code duplication and make the test suite easier to maintain.
>    2. The JSDoc block with a @summary is a convention we use for all new tests. It helps developers (and our AI agents) quickly understand the purpose of a test suite without having to read the full implementation.
> 
>   These are common patterns you'll see in larger projects, and we wanted to share them with you as part of the contribution process.
> 
>   Thanks again for the fantastic contribution

- 2025-10-08T17:55:50Z @tobiu closed this issue
### @erbierc - 2025-10-08T18:10:59Z

Lovely, thank you!

### @tobiu - 2025-10-08T18:23:35Z

Can you imagine that I created all Siesta tests manually? This was pre-AI :)

We are getting very close to complete this epic. Afterwards, we can remove the Siesta based unit tests completely. However, there are many files which don't have any testing yet. This would be worth a Gemini exploration, and new tickets.

There is a second side of the coin: component based testing. I already tried it out for performance-benchmarking here:
https://github.com/neomjs/benchmarks

The numbers favor neo a lot. We can adopt these patterns and use playwright to use different browsers. AI can then still inspect the results, since the harness is nodejs based.

This would definitely be worth a new epic.

Currently, I can barely keep up with the progress: the last release v10.9 was 2 weeks ago, and now we have 150+ new tickets inside: https://github.com/neomjs/neo/tree/dev/.github/ISSUE

### @erbierc - 2025-10-10T12:21:10Z

Tell you what, I am looking to add proper test writing to my skillset, so I could try and help out in that regard! It might take some time, though, as I would need to analyze neo better and learn playwright properly.

I think it would also be neat to add Svelte to the comparison, it is quite strong in performance, as far as I'm aware.

150 tickets is a crazy number!

### @tobiu - 2025-10-10T14:30:28Z

For testing, playwright is definitely gaining momentum in the industry, and as far as i know has now more adoption than cypress. I would also recommend to take a look into [Vitest](https://vitest.dev/). Sadly this one does not really fit for neo, since `Vite` is designed to start a server for one app, while neo needs split-chunks across multiple apps (e.g. app folder inside the neo repo & workspaces). More details: https://github.com/neomjs/neo/blob/dev/learn/benefits/FourEnvironments.md.

Svelte is interesting, since it addresses the "bloated" vdom approach of e.g. React. There are definitely use cases for optimising the performance inside the main thread (closely coupling JSX to DOM elements directly).

However, limiting frontends to a main thread is exactly what neo challenges. The design goal is to run most parts of the framework and your apps in either a dedicated or a shared application web worker. Since workers have no access to the live-DOM, we need a super lightweight vdom abstraction as a cross-thread messaging protocol. This also enables multi-window apps.

I just updated the project vision & roadmap, to better describe the big picture:
https://github.com/neomjs/neo/blob/dev/ROADMAP.md
https://github.com/neomjs/neo/blob/dev/.github/VISION.md


