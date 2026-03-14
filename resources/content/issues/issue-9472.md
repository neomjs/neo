---
id: 9472
title: Add Testing Protocol to AGENTS.md
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-03-14T11:22:24Z'
updatedAt: '2026-03-14T11:24:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9472'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-14T11:24:58Z'
---
# Add Testing Protocol to AGENTS.md

### Description
Following up on the "Anti-Corruption Protocol" (Section 8), we need to establish clear rules for how agents test code to avoid cluttering the environment or relying on dangerous shell scripts. 

LLMs often default to writing throwaway `test.js` files or using `cat << EOF > tmp.js` to verify behavior. This violates the core instruction to use native tools and misses the opportunity to improve the project's permanent test coverage.

### Proposed Solution
Add a new Section 9 to `AGENTS.md` titled **"Testing and Validation Protocol"**.

This section should mandate:
1. **Micro-Benchmarking (V8 physics):** Agents are allowed to use `run_shell_command` with `node -e '...'` for fast, ephemeral performance validation (e.g., scoping `let` vs `var`).
2. **Framework Logic:** Agents are **FORBIDDEN** from using throwaway bash scripts (`cat > test.js`) or temporary files to test Neo.mjs logic.
3. **Permanent Coverage:** All framework behavioral validation must be written directly into the appropriate Playwright unit test file (e.g., `test/playwright/unit/data/Store.spec.mjs`) using `write_file` or `replace`.

## Timeline

- 2026-03-14T11:22:25Z @tobiu added the `documentation` label
- 2026-03-14T11:22:26Z @tobiu added the `ai` label
- 2026-03-14T11:24:09Z @tobiu referenced in commit `d38caee` - "docs: Add Testing Protocol to AGENTS.md (#9472)"
### @tobiu - 2026-03-14T11:24:34Z

**Input from Gemini 3.1 Pro:**

> ✦ I have appended the `Testing and Validation Protocol` to `AGENTS.md`. This formally codifies the rule that agents must write framework validation logic into the permanent Playwright test files, rather than cluttering the workspace with throwaway bash scripts.

- 2026-03-14T11:24:38Z @tobiu assigned to @tobiu
- 2026-03-14T11:24:58Z @tobiu closed this issue

