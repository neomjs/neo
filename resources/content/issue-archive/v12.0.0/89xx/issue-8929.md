---
id: 8929
title: 'Feat: Implement Unit Test Agent Workflow (.agent/workflows/unit-test.md)'
state: CLOSED
labels:
  - documentation
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2026-01-31T21:16:37Z'
updatedAt: '2026-01-31T21:41:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8929'
author: tobiu
commentsCount: 1
parentIssue: 8925
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-31T21:41:39Z'
---
# Feat: Implement Unit Test Agent Workflow (.agent/workflows/unit-test.md)

Create a specialized startup profile for AI agents focused on unit testing.

**File:** `.agent/workflows/unit-test.md`

**Content Requirements:**
- **Context Injection:** Instructions to read `src/Neo.mjs` and `src/core/Base.mjs`.
- **Domain Knowledge:** Instructions to read `learn/guides/testing/UnitTesting.md`.
- **Directives:**
    - **Framework:** Explicitly specify **Playwright** (running in Node.js mode) as the harness.
    - **Architecture:** Explain the "Single-Thread Simulation" concept (App+VDom in one thread).
    - **Critical Rules:**
        - Mandatory import of `src/core/_export.mjs`.
        - Unique class names per test file (Namespace Isolation).
    - **Commands:** Use `npm run test-unit` or the specific file command: `npx playwright test path/to/spec.mjs -c test/playwright/playwright.config.unit.mjs`.

**Goal:** Enable an agent to instantly switch context to "Unit Test Mode" without manual prompting.

## Timeline

- 2026-01-31T21:16:38Z @tobiu added the `documentation` label
- 2026-01-31T21:16:38Z @tobiu added the `developer-experience` label
- 2026-01-31T21:16:38Z @tobiu added the `ai` label
- 2026-01-31T21:16:48Z @tobiu added parent issue #8925
- 2026-01-31T21:40:43Z @tobiu referenced in commit `13faa8b` - "feat: Implement Unit Test Agent Workflow (#8929)"
### @tobiu - 2026-01-31T21:41:01Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully implemented the Unit Test Specialist workflow.
> 
> **Completed Actions:**
> 1.  **Created `.agent/workflows/unit-test.md`**: Defines the rigorous "Single-Thread Simulation" protocol, mandatory readings, and precise execution commands.
> 2.  **Updated `.gitignore`**: Removed the rule ignoring the `.agent` folder to ensure workflows are version controlled.
> 3.  **Updated `learn/guides/testing/UnitTesting.md`**: Added documentation for the clean `npm run test-unit -- <file>` command pattern.
> 4.  **Pushed to `dev`**: All changes are committed under `(#8929)`.
> 
> The foundation for specialized testing agents is now live. I will close this ticket.

- 2026-01-31T21:41:24Z @tobiu assigned to @tobiu
- 2026-01-31T21:41:39Z @tobiu closed this issue

