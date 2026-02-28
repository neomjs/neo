---
id: 8881
title: Enhance Testing Guides with Practical Workflow & Safety Protocols
state: CLOSED
labels:
  - documentation
  - developer-experience
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-01-26T11:17:47Z'
updatedAt: '2026-01-26T11:27:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8881'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-26T11:27:10Z'
---
# Enhance Testing Guides with Practical Workflow & Safety Protocols

**Context:**
The current testing guides (`UnitTesting.md` and `ComponentTesting.md`) provide a good architectural overview but lack practical "Day 1" developer experience details. We need to bridge the gap between "knowing the architecture" and "running the first test".

**Missing Information & Required Updates:**

1.  **Running Specific Tests (The "Focus Mode"):**
    -   Explain how to run a *single* test file to avoid waiting for the full suite during development.
    -   **Command:** `npx playwright test test/playwright/unit/my/file.spec.mjs -c test/playwright/playwright.config.unit.mjs`
    -   **Why:** This is the standard workflow for TDD / debugging.

2.  **The "Safety Net" (Cross-Test Side Effects):**
    -   Explicitly warn that running a single test is *not enough* before committing.
    -   **The Trap:** Because Neo.mjs unit tests run in a shared worker process (for speed), a test in File A can pollute the global namespace/state for File B.
    -   **The Rule:** "Always run `npm run test-unit` (full suite) before pushing to verify isolation."

3.  **Debugging & Filtering:**
    -   Mention the `--debug` flag for stepping through tests.
    -   Mention the `--grep` flag for filtering tests by name.

4.  **File Organization:**
    -   Clarify where new tests should live (mirroring `src` structure).

**Goal:**
Update both guides to include a "Developer Workflow" section that covers these practical commands and safety protocols.

## Timeline

- 2026-01-26T11:17:48Z @tobiu added the `documentation` label
- 2026-01-26T11:17:48Z @tobiu added the `developer-experience` label
- 2026-01-26T11:17:48Z @tobiu added the `ai` label
- 2026-01-26T11:17:48Z @tobiu added the `testing` label
- 2026-01-26T11:26:30Z @tobiu referenced in commit `39af09c` - "docs: Add Developer Workflow to Testing Guides (#8881)"
- 2026-01-26T11:26:44Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-26T11:26:51Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the testing guides to include a practical "Developer Workflow" section.
> 
> **Changes:**
> 1.  **`learn/guides/testing/UnitTesting.md`**:
>     -   Added **"Running a Single File (Focus Mode)"**: Documented the `npx playwright test ... -c ...` command.
>     -   Added **"Debugging"**: Documented `--debug` and `-g` (grep) flags.
>     -   Added **"The Safety Net"**: Clarified the Playwright worker process model vs. Neo.mjs SharedWorkers. Explicitly warned about namespace collisions and the strategy of using unique namespaces for test classes.
> 2.  **`learn/guides/testing/ComponentTesting.md`**:
>     -   Added **"Developer Workflow"**: Documented how to run single component files.
>     -   Added **"Visual Debugging"**: Documented the `--headed` flag.
> 
> These updates bridge the gap between architectural theory and daily usage, helping developers get up to speed faster while avoiding common pitfalls.

- 2026-01-26T11:27:11Z @tobiu closed this issue

