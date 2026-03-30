---
id: 9589
title: 'Implement OIDC/OAuth Authorization for KB and Memory MCP Servers (Restoration of #9558)'
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
  - architecture
assignees: []
createdAt: '2026-03-29T10:01:37Z'
updatedAt: '2026-03-29T10:01:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9589'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-29T10:01:46Z'
---
# Implement OIDC/OAuth Authorization for KB and Memory MCP Servers (Restoration of #9558)

*Note: This issue was created to restore the accidentally deleted issue #9558 for historical record and changelog integrity.*

Implement out-of-the-box OAuth 2.1 / OIDC authorization for the Knowledge Base and Memory Core MCP servers. This enables IaC-driven deployments using standard identity providers like Keycloak.

**Requirements:**
- Map `AUTH_HOST`, `AUTH_PORT`, `AUTH_REALM`, `OAUTH_CLIENT_ID`, and `OAUTH_CLIENT_SECRET` in `aiConfig.mjs`.
- In `Server.mjs` (for both `knowledge-base` and `memory-core`):
    - Automatically setup the `mcpAuthMetadataRouter` for discovery.
    - Implement a `tokenVerifier` using standard token introspection.
    - Apply the `requireBearerAuth` middleware to the SSE transport.
- Ensure the existing `authMiddleware` escape hatch remains functional.

## Timeline

- 2026-03-29T10:01:38Z @tobiu added the `enhancement` label
- 2026-03-29T10:01:38Z @tobiu added the `developer-experience` label
- 2026-03-29T10:01:38Z @tobiu added the `ai` label
- 2026-03-29T10:01:38Z @tobiu added the `architecture` label
- 2026-03-29T10:01:46Z @tobiu closed this issue

