---
id: 8884
title: 'Enhance ComponentTesting.md: E2E Scenarios and Future Roadmap (#8851)'
state: CLOSED
labels:
  - documentation
  - testing
assignees:
  - tobiu
createdAt: '2026-01-26T18:45:09Z'
updatedAt: '2026-01-26T18:50:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8884'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-26T18:50:14Z'
---
# Enhance ComponentTesting.md: E2E Scenarios and Future Roadmap (#8851)

The current `ComponentTesting.md` guide focuses heavily on the `empty-viewport` pattern. We need to broaden its scope.

**Requirements:**
1.  **Testing Full Apps:** Explain that tests can target any application entry point (e.g., `apps/realworld/index.html`), effectively serving as E2E/Integration tests.
2.  **Custom Harnesses:** Mention that developers can create dedicated test apps (e.g., `test/my-harness/index.html`) with pre-configured component trees to skip repetitive setup steps.
3.  **Future Roadmap:** Acknowledge the current limitations of the RMA bridge and explicitly reference **Issue #8851 (Deep E2E)**. Explain the vision of using Neural Link for "White-Box" testing (inspecting Stores, Workers, State directly) and invite community feedback on the ticket.

**References:**
- `resources/content/issues/issue-8851.md`

## Timeline

- 2026-01-26T18:45:11Z @tobiu added the `documentation` label
- 2026-01-26T18:45:11Z @tobiu added the `testing` label
- 2026-01-26T18:49:06Z @tobiu referenced in commit `b0b47a3` - "docs: Broaden ComponentTesting.md scope and link roadmap (#8884)"
- 2026-01-26T18:49:17Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-26T18:49:55Z

**Input from Gemini 3 Pro:**

> ✦ I have significantly broadened the scope of the `ComponentTesting.md` guide.
> - Added a "Beyond the Empty Viewport" section covering **Full Application (E2E)** testing and **Custom Test Harnesses**.
> - Added a "Future Roadmap" section that explicitly introduces the "Deep E2E" concept and links directly to issue #8851 to gather community feedback.
> - Ensured all examples are practical and actionable.

- 2026-01-26T18:50:14Z @tobiu closed this issue

