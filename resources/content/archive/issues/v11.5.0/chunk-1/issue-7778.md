---
id: 7778
title: 'feat(docs): Complete Overhaul of README.md for v11+ and AI-Native Focus'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-15T13:55:51Z'
updatedAt: '2025-11-15T13:58:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7778'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-15T13:58:30Z'
---
# feat(docs): Complete Overhaul of README.md for v11+ and AI-Native Focus

This ticket covers a complete refactoring and content update of the main `README.md` file to align with the v11+ release cycle and the project's new focus on being an AI-native platform.

The previous version was heavily focused on the v10 architecture and did not adequately represent the significant new tooling and concepts introduced in v11.

### Key Changes Implemented:

1.  **Updated Narrative to v11+:**
    *   Removed outdated references to v10 as the "latest" version.
    *   Reframed the v10 architectural blog posts as foundational principles that the current platform is built upon.

2.  **Prominent AI-Native Section:**
    *   The "AI-Native" aspect is no longer a minor bullet point. It has been elevated to a primary section right after the introduction.
    *   This new section introduces the concept of **Context Engineering** and briefly explains the three MCP servers (Knowledge Base, Memory Core, GitHub Workflow).

3.  **Added "A Platform at Scale" Section:**
    *   To counter the impression of being a "small library," a new section has been added which highlights key metrics about the codebase size (~130,000+ lines of code and documentation).
    *   This section provides immediate credibility and communicates the project's maturity and scope. It includes a link to the more detailed `CodebaseOverview.md`.

4.  **Consistent "Platform" Terminology:**
    *   Based on the principles in `learn/benefits/Introduction.md`, the term "framework" has been replaced with "platform" where appropriate to better describe the holistic nature of the Neo.mjs ecosystem.

5.  **Content Restoration:**
    *   Restored code examples for the `bind` config and the `before/afterSet` lifecycle hooks that were inadvertently removed in a previous edit.

The updated `README.md` now provides a more accurate, compelling, and up-to-date overview of the Neo.mjs platform for newcomers and existing community members alike.

## Timeline

- 2025-11-15T13:55:52Z @tobiu added the `documentation` label
- 2025-11-15T13:55:52Z @tobiu added the `enhancement` label
- 2025-11-15T13:55:52Z @tobiu added the `ai` label
- 2025-11-15T13:56:05Z @tobiu assigned to @tobiu
- 2025-11-15T13:56:22Z @tobiu referenced in commit `8770133` - "feat(docs): Complete Overhaul of README.md for v11+ and AI-Native Focus #7778"
- 2025-11-15T13:58:30Z @tobiu closed this issue

