---
id: 8456
title: Automate Release Workflow with Git Squash & Local-First Strategy
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-09T10:09:03Z'
updatedAt: '2026-01-09T10:17:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8456'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T10:17:19Z'
---
# Automate Release Workflow with Git Squash & Local-First Strategy

To streamline the release process, ensure `releases.json` is accurate, and automate the "Squash to Main" pattern, we will create a comprehensive release script.

**Context:**
- Releases are based on the `dev` branch.
- `main` branch is used solely for an atomic squash commit of the release cycle.
- `releases.json` must be up-to-date in the published package.
- Tickets must be archived after the release.

**1. Expose Sync Service**
Modify `ai/services.mjs` to export `GH_SyncService` (mapping to `ai/mcp/server/github-workflow/services/SyncService.mjs`) to enable scriptable syncs.

**2. Create `buildScripts/publishRelease.mjs`**
This script will automate the following workflow:

1.  **Pre-flight Checks:**
    -   Ensure current branch is `dev`.
    -   Ensure `gh` CLI is authenticated.
    -   Verify `resources/content/release-notes/vX.Y.Z.md` exists.

2.  **Prepare (Dev):**
    -   Run `buildScripts/prepareRelease.mjs` (updates version, SEO, `releases.json`).
    -   Stage and Commit changes to `dev` (Message: "Release vX.Y.Z").
    -   Push `dev`.

3.  **Squash to Main (Atomic History):**
    -   Checkout `main`.
    -   `git merge --squash dev`.
    -   Auto-resolve conflicts by accepting "theirs" (the `dev` version).
    -   Commit (Message: "vX.Y.Z").
    -   Push `main`.
    -   **Capture Hash:** Store the new commit hash from `main`.

4.  **Finalize Notes (Dev):**
    -   Checkout `dev`.
    -   Append the `main` commit hash to the local release notes (e.g., "Atomic Changelog: [Hash]").
    -   Commit and Push `dev`.

5.  **Release (GitHub):**
    -   Execute `gh release create vX.Y.Z --target dev --title "vX.Y.Z" --notes-file resources/content/release-notes/vX.Y.Z.md`.
    -   This triggers the `npm-publish` Action (from `dev`).

6.  **Post-Release Cleanup:**
    -   Wait for release propagation.
    -   Run `GH_SyncService.runFullSync()` to archive tickets into `resources/content/issue-archive/vX.Y.Z/`.
    -   Commit and Push `dev`.

## Timeline

- 2026-01-09T10:09:04Z @tobiu added the `enhancement` label
- 2026-01-09T10:09:05Z @tobiu added the `ai` label
- 2026-01-09T10:09:05Z @tobiu added the `build` label
### @tobiu - 2026-01-09T10:12:28Z

**Input from Gemini 3 Pro:**

> ✦ Refinement: After running `buildScripts/prepareRelease.mjs`, we must also execute `npm run build-all` to ensure all production artifacts are compiled with the new version. This step should be added to the 'Prepare (Dev)' phase.

- 2026-01-09T10:16:02Z @tobiu assigned to @tobiu
- 2026-01-09T10:16:16Z @tobiu referenced in commit `e68dd7b` - "feat: Add publishRelease.mjs script for local-first release workflow (#8456)"
### @tobiu - 2026-01-09T10:16:53Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the `buildScripts/publishRelease.mjs` script to automate the local-first release workflow.
> 
> **Key Changes:**
> 1.  **Exposed `GH_SyncService`**: Modified `ai/services.mjs` to export the sync service, enabling the release script to trigger ticket archiving programmatically.
> 2.  **Created Release Script**: `buildScripts/publishRelease.mjs` now handles:
>     *   **Pre-flight Checks**: Verifies branch (`dev`), auth, and release notes.
>     *   **Preparation**: Runs `prepareRelease.mjs` and `npm run build-all`.
>     *   **Atomic History**: Squashes `dev` changes into `main` for a clean release history.
>     *   **Release Creation**: Uses `gh release create` with local artifacts.
>     *   **Post-Release Sync**: Automatically archives closed tickets to `resources/content/issue-archive/vX.Y.Z/` and commits the changes.
> 
> The workflow is now fully automated and ensures `releases.json` and ticket archives are synchronized with the published package.

- 2026-01-09T10:17:19Z @tobiu closed this issue

