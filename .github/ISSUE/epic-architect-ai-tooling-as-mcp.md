# Epic: Architect AI Tooling as a Model Context Protocol (MCP) Servers

GH ticket id: #7399

**Assignee:** tobiu
**Status:** To Do

## Scope

This epic outlines the architectural initiative to transform our current shell-based AI tools (for the knowledge base and memory core) into a formal, robust, and agent-agnostic Model Context Protocol (MCP) server architecture.

The current approach, which relies on agents executing `npm run` scripts and parsing stdout, is brittle, inefficient, and creates platform-specific challenges (e.g., shell quoting). Migrating to a dedicated MCP server architecture will provide a stable, structured API for AI interaction, significantly improving reliability and simplifying agent instructions.

A key goal is to ensure this new architecture is agent-agnostic, allowing different AI models (e.g., from Google, Anthropic) to consume these tools through a standardized configuration, rather than being tied to a specific vendor's settings file (like `.gemini/settings.json`).

This epic (the subs) fit the `Hacktoberfest` scope very well. Please read our event intro epic first:
https://github.com/neomjs/neo/issues/7296

For contributors unfamiliar with the Model Context Protocol, the following official resources are highly recommended:
- [What is the Model Context Protocol?](https://modelcontextprotocol.io/docs/getting-started/intro)
- [Build an MCP Server (Tutorial)](https://modelcontextprotocol.io/docs/develop/build-server)

The subs require our new "AI Native" workflow, and big parts can get resolved by navigating agents.
For getting up to speed, please read:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

Since the epic subs strongly build on and relate to each other, I also strongly recommend joining the Slack and / or Discord Channels,
so that you guys can sync.

https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA
https://discord.gg/6p8paPq

## Sub-Tasks

### Phase 1: Design & Foundation
- **To Do:** ticket-define-agent-agnostic-mcp-config.md
- **To Do:** ticket-design-knowledge-mcp-api.md
- **To Do:** ticket-design-memory-mcp-api.md

### Phase 2: Implementation
- **To Do:** ticket-implement-knowledge-server-scaffold.md
- **To Do:** ticket-implement-knowledge-read-endpoints.md
- **To Do:** ticket-implement-knowledge-query-endpoint.md
- **To Do:** ticket-implement-knowledge-admin-endpoints.md
- **To Do:** ticket-implement-memory-server-scaffold.md
- **To Do:** ticket-implement-memory-read-endpoints.md
- **To Do:** ticket-implement-memory-query-endpoints.md
- **To Do:** ticket-implement-memory-create-endpoint.md
- **To Do:** ticket-implement-memory-lifecycle-endpoints.md
- **To Do:** ticket-implement-memory-admin-endpoints.md

### Phase 3: Integration & Documentation
- **To Do:** ticket-update-agents-md-for-mcp.md
- **To Do:** ticket-create-mcp-server-documentation.md
- **To Do:** ticket-cleanup-old-ai-query-npm-scripts.md
