# Ticket: Refine and Integrate GitHub CLI Guide

GH ticket id: #7418
Labels: `hacktoberfest`, `good first issue`, `documentation`

## Description

This is a follow-up to the excellent "GitHub CLI Setup" guide created in PR #7384. The goal is to better integrate the guide into the project's structure and learning portal, and to enhance it with a more convenient way to manage the `GH_TOKEN`.

This is a great task for learning how documentation is structured and rendered within the Neo.mjs project.

### Tasks:

1.  **Move the Guide:** The guide is currently located at `learn/guides/development/GitHubCLISetup.md`. Please move it to `learn/guides/ai/GitHubCLISetup.md` to group it with other AI-related guides.

2.  **Add to Learning Portal Navigation:** To make the guide visible in the website's learning portal, add an entry for it in the `learn/tree.json` file. It should be placed under the "AI" section (`"parentId": "guides/ai"`). The entry should look something like this:
    ```json
    {"name": "GitHub CLI Setup", "parentId": "guides/ai", "id": "guides/ai/GitHubCLISetup"}
    ```

3.  **Update Guide with `.env` Instructions:** The current guide explains how to set the `GH_TOKEN` using `export`. A more convenient and persistent method is to use the project's `.env` file, which is already used for the `GEMINI_API_KEY`. Please add a new section to the guide explaining how to add the `GH_TOKEN` to the `.env` file (which is git-ignored for security).

    Example content to add:
    > #### Using the .env File (Recommended)
    > For a more permanent setup, you can add your token to the `.env` file located at the root of the project. This file is git-ignored, so your token will not be committed. If the file doesn't exist, you can create it.
    >
    > ```
    > # .env
    > GEMINI_API_KEY="your_gemini_key_here"
    > GH_TOKEN="your_fine_grained_token_here"
    > ```
    > The `npm run server-start` command will automatically load these variables.

4.  **Update `AGENTS.md` Reference:** The `AGENTS.md` file contains a reference to the guide's old location. Please update it to point to the new path: `learn/guides/ai/GitHubCLISetup.md`.

### Verification:

After making the changes, you can verify them by:
1. Running `npm run server-start`.
2. Navigating to the portal app (`http://localhost:8080/apps/portal/`).
3. Finding the "GitHub CLI Setup" guide in the "Guides" -> "AI" section of the side navigation and checking that your new content is there.
