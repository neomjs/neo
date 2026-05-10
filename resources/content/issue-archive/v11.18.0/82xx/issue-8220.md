---
id: 8220
title: 'AI: Implement Knowledge Base Upload Script'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-30T15:41:11Z'
updatedAt: '2025-12-30T15:50:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8220'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-30T15:50:50Z'
---
# AI: Implement Knowledge Base Upload Script

**Context:**
The migration to `gemini-embedding-001` has significantly increased the time required for initial Knowledge Base synchronization (~75 mins due to rate limits). To ensure a smooth onboarding experience ("Zero-Setup DX"), we decided to distribute the pre-built Knowledge Base as a GitHub Release artifact rather than committing it to the repo (which would cause bloat).

**Objective:**
Create a script to automate the packaging and uploading of the local Knowledge Base to the current GitHub Release.

**Tasks:**
1.  **Create Script:** `ai/examples/upload_knowledge_base.mjs`
    *   **Zip:** Compress the `chroma-neo-knowledge-base` directory into `chroma-neo-knowledge-base.zip`.
    *   **Upload:** Use the GitHub CLI (`gh`) to upload the zip to the release tag matching the version in `package.json`.
    *   **Command:** `gh release upload v${version} chroma-neo-knowledge-base.zip --clobber`
2.  **Add NPM Script:** Add `"ai:upload-kb": "node ./ai/examples/upload_knowledge_base.mjs"` to `package.json`.
3.  **Verification:** Execute the script to upload the current Knowledge Base to the existing `v11.17.1` release.

**Prerequisites:**
*   User must have `gh` (GitHub CLI) installed and authenticated.
*   User must have a fully synced `chroma-neo-knowledge-base` locally.


## Timeline

- 2025-12-30T15:41:12Z @tobiu added the `enhancement` label
- 2025-12-30T15:41:12Z @tobiu added the `ai` label
- 2025-12-30T15:45:32Z @tobiu assigned to @tobiu
- 2025-12-30T15:49:18Z @tobiu referenced in commit `f1286e9` - "AI: Implement Knowledge Base Upload Script #8220"
### @tobiu - 2025-12-30T15:49:27Z

**Input from Gemini 2.5 pro:**

> ✦ **Zero-Setup DX Implementation Complete**
> 
> The Knowledge Base distribution workflow is now operational.
> 
> **Artifact:**
> *   Uploaded `chroma-neo-knowledge-base.zip` (92.53 MB) to Release `11.17.1`.
> *   Link: `https://github.com/neomjs/neo/releases/download/11.17.1/chroma-neo-knowledge-base.zip`
> 
> **Scripts:**
> *   **Upload:** `npm run ai:upload-kb` (zips and uploads to GH Releases matching package version).
> *   **Download:** `npm run ai:download-kb` (fetches and unzips).
> *   **Auto-Setup:** `prepare` script in `package.json` runs the download automatically for repo contributors.
> 
> **Verification:**
> The upload script successfully pushed the artifact to the current release.
> 
> Ready for merge.

- 2025-12-30T15:50:50Z @tobiu closed this issue

