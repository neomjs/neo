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
closedAt: '2025-09-22T11:29:46Z'
---
# Add Installation Instructions for Gemini CLI to AI_QUICK_START.md

**Reported by:** @tobiu on 2025-09-22

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

## Comments

### @tobiu - 2025-09-22 11:07

reopening to enhance the pre-requisites further.

### @tobiu - 2025-09-22 11:29

follow-up thought: let us convert it into a read guide.

