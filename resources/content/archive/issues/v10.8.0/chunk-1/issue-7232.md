---
id: 7232
title: Add Installation Instructions for Gemini CLI to AI_QUICK_START.md
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-22T09:36:36Z'
updatedAt: '2025-09-22T11:29:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7232'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-22T11:29:46Z'
---
# Add Installation Instructions for Gemini CLI to AI_QUICK_START.md

## 1. Overview

To improve the developer onboarding experience, this ticket proposes adding a new "Installation" section to the `.github/AI_QUICK_START.md` file. This section will provide explicit instructions for installing and running the Gemini CLI, ensuring that developers have a clear and easy-to-follow setup process.

## 2. Scope of Work

### 2.1. Add Installation Section to `AI_QUICK_START.md`

-   **Task:** Create a new "Installation" section at the beginning of the `.github/AI_QUICK_START.md` file.
-   **Implementation:**
    -   Add instructions for installing the Gemini CLI globally using `npm install -g @google/gemini-cli`.
    -   Include a step on how to start the CLI using the `gemini` command.
    -   Emphasize the importance of running the CLI from the root of the `neo` repository to ensure it has the correct project context.

## 3. Acceptance Criteria

-   The `.github/AI_QUICK_START.md` file is updated with a new "Installation" section.
-   The installation instructions are accurate and easy to follow.
-   The importance of running the CLI from the project root is clearly stated.

## Timeline

- 2025-09-22T09:36:36Z @tobiu assigned to @tobiu
- 2025-09-22T09:36:38Z @tobiu added the `enhancement` label
- 2025-09-22T09:37:06Z @tobiu referenced in commit `274cb61` - "Add Installation Instructions for Gemini CLI to AI_QUICK_START.md #7232"
- 2025-09-22T09:37:14Z @tobiu closed this issue
### @tobiu - 2025-09-22T11:07:40Z

reopening to enhance the pre-requisites further.

- 2025-09-22T11:07:41Z @tobiu reopened this issue
- 2025-09-22T11:08:01Z @tobiu referenced in commit `8636fe1` - "Add Installation Instructions for Gemini CLI to AI_QUICK_START.md #7232"
- 2025-09-22T11:08:07Z @tobiu closed this issue
### @tobiu - 2025-09-22T11:29:31Z

follow-up thought: let us convert it into a read guide.

- 2025-09-22T11:29:31Z @tobiu reopened this issue
- 2025-09-22T11:29:42Z @tobiu referenced in commit `5f93694` - "Add Installation Instructions for Gemini CLI to AI_QUICK_START.md #7232"
- 2025-09-22T11:29:46Z @tobiu closed this issue

