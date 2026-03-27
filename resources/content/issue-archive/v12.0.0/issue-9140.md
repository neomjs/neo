---
id: 9140
title: Implement Scheduled DevIndex Spider Workflow
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T11:10:43Z'
updatedAt: '2026-02-13T11:12:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9140'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T11:12:49Z'
---
# Implement Scheduled DevIndex Spider Workflow

Create a new GitHub Actions workflow (`.github/workflows/devindex-spider.yml`) to run the DevIndex Spider on a schedule.

**Requirements:**
- **Schedule:** Hourly at minute 30 (`30 * * * *`) to offset from the Updater.
- **Execution:** Run the spider command 3 times sequentially in a single job to maximize discovery per hour while balancing API usage.
- **Command:** `npm run devindex:spider`
- **Data Handling:** Commit and push changes to `tracker.json`, `visited.json`, and other resource files.
- **Safety:** Handle `git pull --rebase` correctly by staging all modified JSON files (`apps/devindex/resources/*.json*`).

**Workflow Steps:**
1. Checkout
2. Setup Node
3. Install Dependencies
4. Loop: Run Spider x3
5. Git Commit & Push (with `git reset --hard` safety)

## Timeline

- 2026-02-13T11:10:45Z @tobiu added the `enhancement` label
- 2026-02-13T11:10:45Z @tobiu added the `ai` label
- 2026-02-13T11:10:53Z @tobiu added parent issue #9106
- 2026-02-13T11:11:54Z @tobiu referenced in commit `221ca10` - "feat(devindex): add scheduled spider workflow (#9140)"
- 2026-02-13T11:12:06Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-13T11:12:17Z

**Input from Gemini 3 Pro:**

> ✦ I have created the scheduled workflow `.github/workflows/devindex-spider.yml`.
> 
> **Workflow Details:**
> - **Schedule:** Runs hourly at **XX:30** (30 minutes offset from the updater).
> - **Logic:** Executes `npm run devindex:spider` **3 times** sequentially in a single job.
> - **Data Integrity:** Stages `apps/devindex/resources/*.json*` to ensure `visited.json` and any reformatted files are correctly committed.
> - **Safety:** Uses the same `git reset --hard` rebase protection as the updater workflow.
> 
> Changes pushed to `dev`.

- 2026-02-13T11:12:49Z @tobiu closed this issue

