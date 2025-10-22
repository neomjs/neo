---
id: 7287
title: Convert state/FeedbackLoop.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - nabeel001
createdAt: '2025-09-27T13:59:48Z'
updatedAt: '2025-10-10T11:07:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7287'
author: tobiu
commentsCount: 7
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-10T11:07:14Z'
---
# Convert state/FeedbackLoop.mjs Test from Siesta to Playwright

**Reported by:** @tobiu on 2025-09-27

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

This task is to migrate the unit test for `state/FeedbackLoop.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/state/FeedbackLoop.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/state/FeedbackLoop.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Comments

### @shubham220420 - 2025-10-03 10:23

hey @tobiu, I'd like to work on this, please assign this to me.

### @tobiu - 2025-10-03 16:15

Hi and thanks for your interest. For the testing tickets, I strongly recommend trying out the “ai native” workflow.

I would read the hacktoberfest intro first:
https://github.com/neomjs/neo/issues/7296

Then the following 2 guides:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

E.g. gemini cli should be capable to complete it on its own.

### @nabeel001 - 2025-10-09 04:33

Hi @tobiu 
In case @shubham220420 is unable to resolve this issue, Kindly assign this to me.

### @shubham220420 - 2025-10-09 08:31

Hey @nabeel001 Its not that I am not able to solve it but currently I am a bit busy in my exams, so you can take over this problem :)

### @nabeel001 - 2025-10-09 09:02

Sure @shubham220420 
No worries, All the best with your exams.
I'll take care of this issue.

@tobiu kindly assign this to me

### @tobiu - 2025-10-09 10:52

Hi guys, sure, I can re-assign it. This was interesting on a meta-level: I just updated our contributing md file, to add:

> To keep the project moving, if a ticket is assigned and we do not receive any feedback from the assignee (e.g. via a comment) within 7 days, the ticket may get re-assigned to make it available for other contributors.

https://github.com/neomjs/neo/issues/7426 (also updated it, since it was extremely outdated).

Good luck with your exams from me too!

And no worries: even when this epic is finished, there are a lot more files which could use unit testing (Gemini can identify them, and create new tickets). Plus, there is also component based testing, which would be a full new epic.

### @nabeel001 - 2025-10-10 02:20

Hi @tobiu 
Kindly review and merge the PR.

