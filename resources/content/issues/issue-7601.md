---
id: 7601
title: Create Dynamic OpenAPI Specification Generator for the MCP servers
state: OPEN
labels:
  - enhancement
  - stale
  - ai
assignees: []
createdAt: '2025-10-22T09:36:50Z'
updatedAt: '2026-01-22T03:17:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7601'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Dynamic OpenAPI Specification Generator for the MCP servers

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

## Timeline

- 2025-10-22T09:36:51Z @tobiu added the `enhancement` label
- 2025-10-22T09:36:51Z @tobiu added the `ai` label
### @SarthakJain29 - 2025-10-23T08:20:35Z

Hey, Would love to work on this!


### @tobiu - 2025-10-23T12:43:50Z

@SarthakJain29 Hi! Sorry, I did not flag this item as "low prio backlog". I would strongly recommend to pick a different one: not much to learn here (e.g. just wrapping yaml files into template literals and parsing the config vars), but the bigger problem is: the mcp server APIs are not stable yet => we will add more endpoints, fetch more fields etc., so it would just be a maintenance burden with frequent rewrites.

Feel free to ping me inside the slack / discord general channels => there are huge areas with higher impacts / more to learn / more fun to work on.

### @github-actions - 2026-01-22T03:17:20Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-01-22T03:17:21Z @github-actions added the `stale` label

