---
id: 7301
title: Add Intent-Driven JSDoc to `splitter.MainContainer` Example
state: CLOSED
labels:
  - documentation
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - nikeshadhikari9
createdAt: '2025-09-28T13:34:23Z'
updatedAt: '2025-10-01T08:04:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7301'
author: tobiu
commentsCount: 6
parentIssue: 7296
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-01T08:04:29Z'
---
# Add Intent-Driven JSDoc to `splitter.MainContainer` Example

The existing example for `Neo.component.Splitter` at `examples/component/splitter/MainContainer.mjs` is not easily discoverable by our AI query tool because it lacks descriptive JSDoc comments. 

The goal of this ticket is to add high-quality, intent-driven documentation to this file, making it a more valuable resource for both human developers and our AI agent.

### Tasks:

1.  Open the file `examples/component/splitter/MainContainer.mjs`.
2.  Add a class-level JSDoc comment explaining that this view is an example to demonstrate the splitter component.
3.  Add descriptive JSDoc comments to each method (`createConfigurationComponents`, `createExampleComponent`, `logInstance`, `switchDirection`), explaining its purpose and parameters.
4.  Use `src/core/Base.mjs` as a reference for high-quality, intent-driven JSDoc style.

## Timeline

- 2025-09-28T13:34:25Z @tobiu added the `documentation` label
- 2025-09-28T13:34:25Z @tobiu added the `help wanted` label
- 2025-09-28T13:34:25Z @tobiu added the `good first issue` label
- 2025-09-28T13:34:25Z @tobiu added the `hacktoberfest` label
- 2025-09-28T13:34:25Z @tobiu added parent issue #7296
### @nikeshadhikari9 - 2025-09-29T09:09:52Z

**Hi**, I have recently known and started writing JSDoc based comments with docdash theme for my personal projects and would be great If I could know more about the intent-driven JSDoc style from the existing comments from `src/core/Base.mjs` file and would love to contribute to write similar intent-driven JSDoc style comment to `examples/component/splitter/MainContainer.mjs` file.

Could you please assign this documentation issue to me? I’d be happy to submit a PR with the updated comments.

- 2025-09-29T09:37:24Z @nikeshadhikari9 cross-referenced by #7299
### @tobiu - 2025-09-29T09:41:09Z

Sure, and thanks for your interest! Hint: do not submit PRs before October 1, to ensure they count for the Hacktoberfest event.

I just finished:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md

Which relates to:
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

While the task can be easily done manually, I encourage you to try out the new "AI Native" workflows.

- 2025-09-29T09:41:16Z @tobiu assigned to @nikeshadhikari9
### @nikeshadhikari9 - 2025-09-29T12:37:31Z

Thank you for the advice, I will surely go through the both readme's and try to use the AI Native workflows.


### @tobiu - 2025-09-29T13:51:14Z

You are welcome. Let me explain my own rationale a bit:
It has definitely taken me longer to craft the intro ticket and subs, than it would have taken to just tell Gemini to resolve the tasks.

So, my goal is not to just delegate work, but to enable others to learn something new on the way. Since you mentioned that that you looked at `core.Base`: You will most likely agree, that it takes a lot of cognitive load to even understand parts of it. And yet, the class config system (combined with the `Neo.mjs` file) enables us to do great things.

Bigger picture: my goal is to enable others to get the most out of multi-threaded frontend development, without the need to fully understand the internal mechanics => making the platform/framework more accessible and approachable.

### @nikeshadhikari9 - 2025-09-29T14:33:27Z

That makes a lot of sense, and I really appreciate your approach! I can see how the goal is not just to get things done, but to make the learning journey meaningful for everyone involved. I agree that understanding `core.Base` and the class config system takes a lot of mental load, but it’s amazing how it enables so much flexibility and power.

Also as you advised I was trying out the "AI Native" worflow, I stumbled upon the installation of google gemini cli and found out the package name was bit off in 
[https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md](https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md#4-configuring-an-agent-optional-example-gemini-cli)

Currently it is:
`npm i -g @google/generative-ai/cli`

It should have been: 
`npm i -g @google/gemini-cli`

Would it be okay if I update this in my next PR?

### @tobiu - 2025-09-29T14:44:29Z

Thanks for the heads up! Normally I would recommend to open a ticket (please do in the future!), but since this item affects to hacktoberfest onboarding experience for others, I will change & push it right away.

There is a Slack & a Discord Channel posted inside the parent ticket, in case you prefer a more direct communication (e.g. for asking questions).

- 2025-09-29T14:46:40Z @tobiu referenced in commit `4b6a979` - "AI_QUICK_START.md: fixed the gemini cli installation path. thx for the heads-up! #7301"
- 2025-10-01T06:32:26Z @nikeshadhikari9 cross-referenced by PR #7313
- 2025-10-01T08:04:29Z @tobiu closed this issue

