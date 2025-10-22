---
id: 7391
title: Refactor createGhIssue.mjs to use fs-extra for consistency
state: OPEN
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - divyanshkul
createdAt: '2025-10-06T11:18:35Z'
updatedAt: '2025-10-06T11:58:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7391'
author: tobiu
commentsCount: 2
parentIssue: 7364
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Refactor createGhIssue.mjs to use fs-extra for consistency

**Reported by:** @tobiu on 2025-10-06

---

**Parent Issue:** #7364 - Integrate GitHub CLI to Streamline Contribution Workflow

---

The `buildScripts/ai/createGhIssue.mjs` script currently uses a mix of `fs` and `fs/promises` for file system operations. The `fs-extra` library is already a project dependency and provides a more consistent and often more convenient API for file system operations, including synchronous alternatives. This ticket is to refactor the script to exclusively use `fs-extra` for all file system interactions, improving consistency and potentially simplifying the code.

## Acceptance Criteria

1.  The `buildScripts/ai/createGhIssue.mjs` script is refactored to use `fs-extra` for all file system operations.
2.  The script's functionality remains unchanged.
3.  All `fs` and `fs/promises` imports are replaced with `fs-extra`.

## Comments

### @divyanshkul - 2025-10-06 11:46

Hi @tobiu 
Can I work on this?

### @tobiu - 2025-10-06 11:57

Hi, and thanks for your interest.

The main theme of this years hacktoberfest here is:
https://github.com/neomjs/neo/issues/7296

Mostly a learning experience to try out the new "AI Native" workflows:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

While you could do this task manually, agents can fully complete it on their own.
After following the AGENTS.md instructions, just point the agent to:
.github/ISSUE/epic-integrate-github-cli-workflow.md
.github/ISSUE/ticket-refactor-create-gh-issue-to-use-fs-extra.md

Feel free to join the chat channels:
https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA
https://discord.gg/6p8paPq

