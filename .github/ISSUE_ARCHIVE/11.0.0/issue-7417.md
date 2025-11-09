---
id: 7417
title: Polish the new 'Getting Started' Guide
state: CLOSED
labels:
  - documentation
  - hacktoberfest
assignees:
  - Mariam-Saeed
createdAt: '2025-10-08T13:19:53Z'
updatedAt: '2025-10-09T11:06:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7417'
author: tobiu
commentsCount: 2
parentIssue: 7296
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-09T11:06:13Z'
---
# Polish the new 'Getting Started' Guide

**Reported by:** @tobiu on 2025-10-08

---

**Parent Issue:** #7296 - Hacktoberfest 2025: Build Your AI Development Skills with Neo.mjs

---

This ticket is a follow-up to the excellent new "Creating Your First App" guide. The goal is to make a few minor formatting adjustments to fully integrate it into the learning portal's rendering engine.

This is a great task to learn about the specifics of how the Neo.mjs documentation portal works.

### Tasks:

1.  **Remove Manual Table of Contents:** The file `learn/gettingstarted/CreatingYourFirstApp.md` currently has a manual Table of Contents at the top. The learning portal generates this automatically from the `##` headings, so this section should be removed.

2.  **Correct Code Block Formatting:** The portal requires a special flag on all fenced code blocks to render them correctly.
    *   For all shell/bash commands and folder structures, change the fence from ` `shell` or `plaintext` to ` `bash readonly`.
    *   For all JavaScript code blocks, change the fence from `JavaScript` to `javascript readonly`.

3.  **Add Guide to Navigation:** To make the guide appear in the left-hand navigation of the learning portal, add an entry for it in the `learn/tree.json` file. It should be placed within the "Getting Started" section. The entry should look something like this:
    ```json
    {"name": "Creating Your First App", "parentId": "GettingStarted", "id": "gettingstarted/CreatingYourFirstApp"}
    ```

### Verification:

After making the changes, you can see them live by:
1. Running `npm run server-start` in your terminal.
2. Navigating to the portal app in your browser (usually `http://localhost:8080/apps/portal/`).
3. Finding the "Creating Your First App" guide in the "Getting Started" section of the side navigation.
4. Verifying that the guide renders correctly, with no manual table of contents and with styled code blocks.

## Comments

### @Mariam-Saeed - 2025-10-08 15:26

@tobiu 
Thank you for merging my previous PR!
You can assign this issue to me, I’ll be happy to handle these changes 😊

### @tobiu - 2025-10-08 15:29

thx, appreciated! you could try gemini cli here.

