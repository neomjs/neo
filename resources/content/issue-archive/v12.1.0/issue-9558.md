---
id: 9558
title: Implement OIDC/OAuth Authorization for KB and Memory MCP Servers
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-26T13:39:19Z'
updatedAt: '2026-03-26T14:07:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9558'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-26T13:51:01Z'
---
# Implement OIDC/OAuth Authorization for KB and Memory MCP Servers

Implement out-of-the-box OAuth 2.1 / OIDC authorization for the Knowledge Base and Memory Core MCP servers. This enables IaC-driven deployments using standard identity providers like Keycloak.

**Requirements:**
- Map `AUTH_HOST`, `AUTH_PORT`, `AUTH_REALM`, `OAUTH_CLIENT_ID`, and `OAUTH_CLIENT_SECRET` in `aiConfig.mjs`.
- In `Server.mjs` (for both `knowledge-base` and `memory-core`):
    - Automatically setup the `mcpAuthMetadataRouter` for discovery.
    - Implement a `tokenVerifier` using standard token introspection.
    - Apply the `requireBearerAuth` middleware to the SSE transport.
- Ensure the existing `authMiddleware` escape hatch remains functional.

## Timeline

- 2026-03-26T13:39:20Z @tobiu added the `enhancement` label
- 2026-03-26T13:39:20Z @tobiu added the `developer-experience` label
- 2026-03-26T13:39:20Z @tobiu added the `ai` label
- 2026-03-26T13:39:21Z @tobiu added the `architecture` label
- 2026-03-26T13:50:50Z @tobiu referenced in commit `db1cc18` - "Implement OIDC/OAuth 2.1 authorization for KB and Memory Core MCP servers (#9558)"
- 2026-03-26T13:51:02Z @tobiu closed this issue
### @tobiu - 2026-03-26T13:55:58Z

**Input from Gemini 3.1 Pro:**

> ✦ I have completed the implementation of OIDC/OAuth 2.1 authorization for the Knowledge Base and Memory Core MCP servers. 
> 
> **Key Enhancements:**
> - Added `auth` configuration block to `aiConfig.mjs` to support `AUTH_HOST`, `AUTH_PORT`, `AUTH_REALM`, `OAUTH_CLIENT_ID`, and `OAUTH_CLIENT_SECRET`.
> - Updated `Server.mjs` to automatically wire up `mcpAuthMetadataRouter`, `requireBearerAuth`, and a standard `tokenVerifier` when `AUTH_HOST` is present.
> - **Protocol Awareness:** Implemented a `getFullUrl` helper that intelligently defaults to HTTPS for remote hosts while allowing HTTP for local development (localhost/127.0.0.1). 
> - **Consistency:** Added `import 'dotenv/config'` to all MCP server entry points (KB, Memory, GitHub, Neural Link) to ensure environment variables are consistently loaded.
> 
> The servers are now ready for IaC-driven deployments using standard identity providers like Keycloak.

- 2026-03-26T13:57:17Z @tobiu referenced in commit `8a66876` - "Implement CORS support for MCP servers (#9558)"
### @tobiu - 2026-03-26T13:57:28Z

Added CORS support to Knowledge Base and Memory Core MCP servers for better cross-origin client compatibility.

- 2026-03-26T14:06:10Z @tobiu referenced in commit `6cb5ba4` - "Implement OIDC/OAuth 2.1, CORS, and env mapping for MCP servers (#9558, #9560)"
- 2026-03-26T14:07:10Z @tobiu assigned to @tobiu

