---
id: 7399
title: Architect AI Tooling as a Model Context Protocol (MCP) Servers
state: CLOSED
labels:
  - help wanted
  - good first issue
  - epic
  - hacktoberfest
  - ai
assignees:
  - tobiu
createdAt: '2025-10-07T09:26:04Z'
updatedAt: '2025-10-24T09:27:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7399'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 7400 Define Agent-Agnostic MCP Server Configuration'
  - '[x] 7401 Design Knowledge Base MCP Server API'
  - '[x] 7402 Design Memory Core MCP Server API'
  - '[x] 7403 MCP Server: Implement Knowledge Server Scaffold'
  - '[x] 7404 MCP Server: Implement Knowledge Read Endpoints'
  - '[x] 7406 MCP Server: Implement Knowledge Admin Endpoints'
  - '[x] 7407 MCP Server: Implement Memory Server Scaffold'
  - '[x] 7408 MCP Server: Implement Memory Read Endpoints'
  - '[x] 7409 MCP Server: Implement Memory Query Endpoints'
  - '[x] 7410 MCP Server: Implement Memory Create Endpoint'
  - '[x] 7411 MCP Server: Implement Memory Lifecycle Endpoints'
  - '[x] 7412 MCP Server: Implement Memory Admin Endpoints'
  - '[x] 7425 MCP Config: Align Knowledge Server Port and Health Check'
  - '[x] 7464 MCP Server: Refine Memory Server Endpoints'
  - '[x] 7468 MCP Server: Relocate Memory API Specification'
subIssuesCompleted: 15
subIssuesTotal: 15
blockedBy: []
blocking: []
closedAt: '2025-10-24T09:27:25Z'
---
# Architect AI Tooling as a Model Context Protocol (MCP) Servers

This epic outlines the architectural initiative to transform our current shell-based AI tools (for the knowledge base and memory core) into a formal, robust, and agent-agnostic Model Context Protocol (MCP) server architecture.

The current approach, which relies on agents executing `npm run` scripts and parsing stdout, is brittle, inefficient, and creates platform-specific challenges (e.g., shell quoting). Migrating to a dedicated MCP server architecture will provide a stable, structured API for AI interaction, significantly improving reliability and simplifying agent instructions.

A key goal is to ensure this new architecture is agent-agnostic, allowing different AI models (e.g., from Google, Anthropic) to consume these tools through a standardized configuration, rather than being tied to a specific vendor's settings file (like `.gemini/settings.json`).

This epic (the subs) fit the `Hacktoberfest` scope very well. Please read our event intro epic first: https://github.com/neomjs/neo/issues/7296

For contributors unfamiliar with the Model Context Protocol, the following official resources are highly recommended:
- [What is the Model Context Protocol?](https://modelcontextprotocol.io/docs/getting-started/intro)
- [Build an MCP Server (Tutorial)](https://modelcontextprotocol.io/docs/develop/build-server)

The subs require our new "AI Native" workflow, and big parts can get resolved by navigating agents.
For getting up to speed, please read:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

Since the epic subs strongly build on and relate to each other, I also strongly recommend joining the Slack and / or Discord Channels, so that you guys can sync.

https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA
https://discord.gg/6p8paPq

[Update] The "big picture" of all the current epics is mostly related to **context engineering**:
https://github.com/neomjs/neo/blob/dev/ROADMAP.md
https://github.com/neomjs/neo/blob/dev/.github/VISION.md

## Sub-Tasks

### Phase 1: Design & Foundation
- **Done:** ticket-define-agent-agnostic-mcp-config.md
- **To Do:** ticket-design-knowledge-mcp-api.md
- **Done:** ticket-design-memory-mcp-api.md
- **Done:** ticket-mcp-config-align-knowledge-server.md

### Phase 2: Implementation
- **To Do:** ticket-implement-knowledge-server-scaffold.md
- **To Do:** ticket-implement-knowledge-read-endpoints.md
- **To Do:** ticket-implement-knowledge-query-endpoint.md
- **To Do:** ticket-implement-knowledge-admin-endpoints.md
- **Done:** ticket-implement-memory-server-scaffold.md
- **Done:** ticket-implement-memory-read-endpoints.md
- **Done:** ticket-implement-memory-query-endpoints.md
- **To Do:** ticket-implement-memory-create-endpoint.md
- **To Do:** ticket-implement-memory-lifecycle-endpoints.md
- **To Do:** ticket-implement-memory-admin-endpoints.md
- **To Do:** ticket-refine-memory-server-endpoints.md

### Phase 3: Integration & Documentation
- **Done:** ticket-relocate-memory-api-spec.md
- **To Do:** ticket-update-agents-md-for-mcp.md
- **To Do:** ticket-create-mcp-server-documentation.md
- **To Do:** ticket-cleanup-old-ai-query-npm-scripts.md

## Timeline

- 2025-10-07T09:26:04Z @tobiu assigned to @tobiu
- 2025-10-07T09:26:06Z @tobiu added the `epic` label
- 2025-10-07T09:26:06Z @tobiu added the `ai` label
- 2025-10-07T09:26:45Z @tobiu referenced in commit `59a9701` - "#7399 internal ticket files WIP"
- 2025-10-07T09:45:02Z @tobiu added sub-issue #7400
- 2025-10-07T10:01:58Z @tobiu cross-referenced by #7400
- 2025-10-07T10:05:49Z @tobiu added sub-issue #7401
- 2025-10-07T10:06:28Z @tobiu added the `help wanted` label
- 2025-10-07T10:06:28Z @tobiu added the `good first issue` label
- 2025-10-07T10:06:28Z @tobiu added the `hacktoberfest` label
- 2025-10-07T10:08:22Z @tobiu added sub-issue #7402
- 2025-10-07T10:10:59Z @tobiu added sub-issue #7403
- 2025-10-07T10:12:57Z @tobiu added sub-issue #7404
- 2025-10-07T10:14:43Z @tobiu added sub-issue #7405
- 2025-10-07T10:17:16Z @tobiu added sub-issue #7406
- 2025-10-07T10:19:24Z @tobiu added sub-issue #7407
- 2025-10-07T10:21:06Z @tobiu added sub-issue #7408
- 2025-10-07T10:24:24Z @tobiu added sub-issue #7409
- 2025-10-07T10:26:39Z @tobiu added sub-issue #7410
- 2025-10-07T10:29:12Z @tobiu added sub-issue #7411
- 2025-10-07T10:30:51Z @tobiu added sub-issue #7412
- 2025-10-07T10:31:44Z @tobiu referenced in commit `398d1b0` - "#7399 internal ticket md files"
- 2025-10-07T10:45:53Z @tobiu cross-referenced by #7408
- 2025-10-07T10:48:10Z @tobiu added sub-issue #7413
- 2025-10-07T10:48:55Z @tobiu referenced in commit `d5c5e05` - "#7399 MCP Server: Implement Knowledge Create/Update Endpoint sub"
- 2025-10-07T10:52:53Z @tobiu removed sub-issue #7413
- 2025-10-07T10:58:05Z @tobiu referenced in commit `396ddf0` - "#7399 ticket polishing"
- 2025-10-07T16:30:53Z @tobiu cross-referenced by #7403
- 2025-10-08T09:32:21Z @tobiu cross-referenced by #7401
- 2025-10-08T09:35:53Z @tobiu cross-referenced by #7410
- 2025-10-08T12:12:54Z @MannXo cross-referenced by #7404
- 2025-10-08T12:37:25Z @tobiu cross-referenced by #7283
- 2025-10-08T14:47:34Z @tobiu referenced in commit `560d280` - "#7399 minor sub changes, for a better new file location"
### @tobiu - 2025-10-08T15:22:08Z

FYI: https://geminicli.com/extensions/

=> while this is limited to gemini, it is definitely worth to brainstorm about it.

> ✦ Here is my new analysis based on the actual content:
> 
>    1. The Goal is to Build "Extensions": You are correct. The entire initiative is about creating Gemini CLI Extensions. The geminicli.comite positions these as the primary way to integrate tools and personalize the CLI. Our Knowledge Base and Memory Core servers are not just standalone projects; they are features to be packaged as extensions for this ecosystem.
> 
>    2. Anatomy of an Extension: The main page clarifies that an extension is a bundle that can contain MCP servers, context files, and custom commands. This is a key insight. While MCP is the dominant mechanism, as seen on the browse page, an extension is a broader concept. This means for our epics, we need to consider if we only need an MCP server, or if we should also provide context files or custom commands to make the user experience better.
> 
>    3. A Rich Ecosystem: The browse page shows a mature ecosystem with extensions for major platforms like Stripe, Terraform, Grafana, and many Google Cloud services. The chrome-devtools-mcp extension is listed at the top, which firmly places our own DevTools integration work within this same strategic direction.
> 
>   This new context is extremely valuable. It reframes the goal of the epic-architect-ai-tooling-as-mcp.md epic. We are not just refactoring scripts into servers; we are building full-fledged extensions for a specific, documented platform. The "Build your own" section mentioned on the main page will be a critical resource for our scaffolding tickets, as it will define what a complete, well-formed extension looks like.
> 
>   Thank you for this essential context update.

- 2025-10-08T15:36:51Z @tobiu cross-referenced by PR #7419
- 2025-10-08T15:56:22Z @tobiu cross-referenced by #7407
- 2025-10-08T16:31:50Z @tobiu cross-referenced by #7406
- 2025-10-09T10:25:30Z @tobiu added sub-issue #7425
- 2025-10-10T14:10:09Z @tobiu cross-referenced by #7409
- 2025-10-11T18:03:00Z @tobiu added sub-issue #7464
- 2025-10-12T11:17:44Z @tobiu added sub-issue #7468
- 2025-10-12T11:20:48Z @tobiu referenced in commit `68c7980` - "#7399 sub-tasks cleanup"
- 2025-10-24T09:26:54Z @tobiu removed sub-issue #7405
### @tobiu - 2025-10-24T09:27:25Z

resolved => inside the new servers

- 2025-10-24T09:27:25Z @tobiu closed this issue

