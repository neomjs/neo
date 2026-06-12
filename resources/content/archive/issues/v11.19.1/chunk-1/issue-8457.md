---
id: 8457
title: Optimize Release Squash using Git Plumbing
state: CLOSED
labels:
  - enhancement
  - build
assignees:
  - tobiu
createdAt: '2026-01-09T10:23:20Z'
updatedAt: '2026-01-09T10:36:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8457'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T10:36:11Z'
---
# Optimize Release Squash using Git Plumbing

To resolve persistent merge conflicts during the "Squash to Main" phase of the release workflow, we will replace the high-level `git merge` strategy with low-level git plumbing commands.

**Problem:**
Massive refactorings and file moves without `git mv` cause Git's rename detection to fail during `git merge --squash`, leading to extensive conflicts that require "accept theirs" resolution.

**Solution:**
Implement the "No-Checkout Snapshot" strategy in `buildScripts/publishRelease.mjs`. Instead of merging, we will construct a new commit on `main` that points directly to `dev`'s file tree.

**Plan:**
Update `buildScripts/publishRelease.mjs` to:
1.  Fetch `origin/main` to get the latest parent hash.
2.  Get the tree hash of the current `dev` HEAD (`git rev-parse HEAD^{tree}`).
3.  Use `git commit-tree` to create a new commit object:
    -   Tree: `dev`'s tree
    -   Parent: `origin/main`
    -   Message: "vX.Y.Z"
4.  Update the local `main` ref to this new commit (`git update-ref`).
5.  Push the new commit to `origin/main`.

**Benefits:**
-   **Zero Conflicts:** Bypasses conflict detection entirely.
-   **Performance:** Instant execution (no file I/O or checkout).
-   **Reliability:** Guarantees `main` is a byte-for-byte copy of `dev`.

## Timeline

- 2026-01-09T10:23:21Z @tobiu added the `enhancement` label
- 2026-01-09T10:23:21Z @tobiu added the `build` label
- 2026-01-09T10:25:47Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T10:35:43Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the optimization for the release workflow.
> The `buildScripts/publishRelease.mjs` script now uses `git commit-tree` and `git update-ref` to create the main branch squash commit. This bypasses the need for `git merge`, eliminating merge conflicts caused by file renames and moves.
> The wording in the release notes has also been updated to "All changes delivered in 1 atomic commit:".

- 2026-01-09T10:36:11Z @tobiu closed this issue
- 2026-01-09T10:39:03Z @tobiu referenced in commit `22b7fe2` - "feat: Optimize release workflow with git plumbing and wording update (#8457)"

