---
id: 7776
title: Improve Generative Engine Optimization for the Portal App
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-15T11:56:40Z'
updatedAt: '2025-11-15T12:30:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7776'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-15T12:30:46Z'
---
# Improve Generative Engine Optimization for the Portal App

This ticket is to track the improvement of the Generative Engine Optimization (GEO) for the main portal application (`apps/portal/index.html`).

The goal is to provide rich, structured data to generative engines (like Google's AI Overviews, Perplexity, etc.) to improve how they understand and present information about the Neo.mjs framework.

The `apps/portal/index.html` file has been updated with three `application/ld+json` schemas:

1.  **SoftwareApplication (Runtime Framework):** Describes the core Neo.mjs framework.
2.  **SoftwareApplication (AI-Native Development Platform):** Highlights the AI-specific features and MCP servers.
3.  **FAQPage:** Addresses common questions about the framework.

**Task:**

Review and refine the content of these schemas to ensure they are accurate, comprehensive, and optimized for generative engines. This may involve:

*   Verifying all URLs and facts.
*   Improving descriptions and feature lists.
*   Adding or removing properties as needed to best represent the framework.
*   Ensuring the content is free of "hallucinations" or inaccuracies.

This is based on the concept of Generative Engine Optimization.

## Timeline

- 2025-11-15T11:56:41Z @tobiu added the `documentation` label
- 2025-11-15T11:56:42Z @tobiu added the `enhancement` label
- 2025-11-15T11:56:42Z @tobiu added the `ai` label
- 2025-11-15T11:56:50Z @tobiu assigned to @tobiu
- 2025-11-15T12:30:38Z @tobiu referenced in commit `a51a4ab` - "Improve Generative Engine Optimization for the Portal App #7776"
- 2025-11-15T12:30:46Z @tobiu closed this issue

