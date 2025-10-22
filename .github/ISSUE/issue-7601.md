---
id: 7601
title: Create Dynamic OpenAPI Specification Generator for the MCP servers
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-10-22T09:36:50Z'
updatedAt: '2025-10-22T09:36:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7601'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Create Dynamic OpenAPI Specification Generator for the MCP servers

**Reported by:** @tobiu on 2025-10-22

Currently, our `openapi.yaml` files contain hardcoded values for defaults and constraints (e.g., `default: 30`, `maximum: 100`). While this provides valuable context to AI agents via the `toolService`, it has a significant drawback: the specification can become out of sync with the application's actual configuration.

If a user changes a default value in a `config.mjs` file, the agent, whose tools are derived from the static YAML file, will remain unaware of the new default. This creates a divergence between the documented behavior and the actual behavior.

The ideal solution is to make the OpenAPI specification itself dynamic. This ticket proposes creating a build script or server startup process that:

1.  Reads a base `openapi.yaml` template.
2.  Reads the relevant `.mjs` configuration files for each MCP server.
3.  Injects the configuration values (e.g., defaults, limits) into the appropriate sections of the OpenAPI template.
4.  Outputs a final, complete `openapi.json` or `openapi.yaml` file that is then used by the `toolService` and served to clients.

This will ensure that the tool definitions provided to AI agents are always a perfect reflection of the server's current configuration.

## Acceptance Criteria

1.  A new script is created (e.g., in `ai/mcp/server/`) to handle the generation of the OpenAPI specification.
2.  The script correctly reads a template YAML file.
3.  The script correctly reads the server configuration files.
4.  The script merges the configuration values into the template to produce a final, valid OpenAPI specification.
5.  The MCP server startup process is modified to either run this script or read the generated file, ensuring it always uses the dynamic spec.

