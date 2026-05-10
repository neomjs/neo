---
id: 8221
title: 'AI: Update Quick Start Guide for Pre-Built Knowledge Base'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-12-30T15:54:17Z'
updatedAt: '2025-12-30T16:34:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8221'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-30T16:34:19Z'
---
# AI: Update Quick Start Guide for Pre-Built Knowledge Base

**Context:**
The migration to `gemini-embedding-001` drastically changed the initial setup requirements due to strict daily rate limits. We have implemented a "Zero-Setup" strategy where the Knowledge Base is downloaded automatically via `npm install` (using the `prepare` script).

**Problem:**
`.github/AI_QUICK_START.md` is outdated and misleading:
1.  It claims the "free tier is generous" (it's now very restrictive for full syncs).
2.  It states embedding "takes 2-5 minutes" (it now takes ~25 mins if done manually).
3.  It instructs users to rely on automatic embedding via MCP servers, which we want to avoid for the initial run.

**Objective:**
Rewrite `.github/AI_QUICK_START.md` to reflect the new workflow:
1.  **Automatic Setup:** Explain that `npm install` downloads the pre-built Knowledge Base artifact.
2.  **Manual Download:** Document `npm run ai:download-kb` for troubleshooting.
3.  **API Key:** Clarify that the Gemini API Key is primarily for the *Agent* interaction and *incremental* KB updates, not strictly required for the initial KB existence anymore.
4.  **Rate Limits:** Update the "Note on Cost" to mention the strict daily limits if users choose to rebuild the KB manually (`npm run ai:sync-kb`).

**Acceptance Criteria:**
*   The guide accurately guides a new user through the "Zero-Setup" process.
*   Misleading claims about speed and rate limits are corrected.


## Timeline

- 2025-12-30T15:54:18Z @tobiu added the `documentation` label
- 2025-12-30T15:54:18Z @tobiu added the `ai` label
- 2025-12-30T15:54:37Z @tobiu assigned to @tobiu
- 2025-12-30T16:33:56Z @tobiu referenced in commit `ce45f99` - "AI: Update Quick Start Guide for Pre-Built Knowledge Base #8221"
- 2025-12-30T16:34:19Z @tobiu closed this issue

