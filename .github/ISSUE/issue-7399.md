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
  - 7400
  - 7401
  - 7402
  - 7403
  - 7404
  - 7406
  - 7407
  - 7408
  - 7409
  - 7410
  - 7411
  - 7412
  - 7425
  - 7464
  - 7468
subIssuesCompleted: 15
subIssuesTotal: 15
closedAt: '2025-10-24T09:27:25Z'
---
# Architect AI Tooling as a Model Context Protocol (MCP) Servers

**Reported by:** @tobiu on 2025-10-07

---

**Sub-Issues:** #7400, #7401, #7402, #7403, #7404, #7406, #7407, #7408, #7409, #7410, #7411, #7412, #7425, #7464, #7468
**Progress:** 15/15 completed (100%)

---

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

## Comments

### @tobiu - 2025-10-08 15:22

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

### @tobiu - 2025-10-24 09:27

resolved => inside the new servers

