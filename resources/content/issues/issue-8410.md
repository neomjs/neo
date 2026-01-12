---
id: 8410
title: 'Agent OS: Implement ''Janitor'' capability for automated Ticket Sync'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-01-08T07:46:34Z'
updatedAt: '2026-01-08T07:46:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8410'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Agent OS: Implement 'Janitor' capability for automated Ticket Sync

**Goal:** Automate the commit and push of GitHub ticket metadata (local `.md` files) to remove the burden of manual "Ticket Sync" commits from the human developer.

**Context:**
Currently, the `github-workflow` MCP server automatically runs `sync_all` on startup, updating the local `.github/ISSUE/` files. However, the *commit and push* of these changes remains a manual task for the developer. Including these changes in feature commits pollutes the diffs. A GitHub Action is suboptimal due to potential `git push` conflicts.

**Solution:**
Implement a "Janitor" capability within the **Neo Agent OS** (Node.js runtime).
- **Trigger:** Periodic (e.g., every 30 mins) or Event-based (after Agent task completion).
- **Action:**
    1.  Run `sync_all` tool (to capture any mid-session updates).
    2.  Check `git status` for changes in `.github/ISSUE/` or `.github/RELEASE_NOTES/`.
    3.  If changes exist: `git add .github && git commit -m "chore: Ticket Sync [skip ci]" && git push`.
- **Constraint:** Should verify the repo is clean/idle to avoid disrupting user work.

**Why:**
To automate metadata hygiene without polluting feature history or causing remote merge conflicts.

## Timeline

- 2026-01-08T07:46:35Z @tobiu added the `enhancement` label
- 2026-01-08T07:46:35Z @tobiu added the `ai` label

