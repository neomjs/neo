---
id: 7286
title: Convert state/createHierarchicalDataProxy.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - kart-u
createdAt: '2025-09-27T13:58:44Z'
updatedAt: '2025-10-07T19:00:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7286'
author: tobiu
commentsCount: 5
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-07T19:00:04Z'
---
# Convert state/createHierarchicalDataProxy.mjs Test from Siesta to Playwright

**Reported by:** @tobiu on 2025-09-27

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

This task is to migrate the unit test for `state/createHierarchicalDataProxy.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/state/createHierarchicalDataProxy.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/state/createHierarchicalDataProxy.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Comments

### @kart-u - 2025-10-04 08:59

Hello @tobiu I would like to work on this , can you assign it to me

### @tobiu - 2025-10-04 09:21

sure. one more recommendation:
https://github.com/neomjs/neo/issues/7343

=> you can try out the new memory core, in case you update your fork to get the latest changes in there. this should help when working on test migrations. meaning: if you had a good session to migrate a test, inside a fresh session you can point the ai agent to that session memory, and it can pick up on it.

### @kart-u - 2025-10-04 10:19

thanks!! will surely try this 

### @kart-u - 2025-10-04 12:23

yes I tried new memory core , it was quite convenient ,without much additional input Gemini was able to infer issue from past contexts and less errors

now i have submitted PRs for all 4 assigned issues (waiting to be reviewed):-
#7293 
#7289 
#7286 
#7284 



### @tobiu - 2025-10-04 12:29

thanks! i will look into it very soon (today). feel free to join the slack and / or discord.

i am just ironing out a few more glitches with using the memory core:

<img width="991" height="1266" alt="Image" src="https://github.com/user-attachments/assets/94a07d38-b4f3-4ab7-9864-d4dde7bf683c" />

