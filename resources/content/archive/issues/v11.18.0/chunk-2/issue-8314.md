---
id: 8314
title: '[Neural Link] Feature: Support --cwd CLI argument'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-04T15:58:36Z'
updatedAt: '2026-01-04T16:15:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8314'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T16:15:26Z'
---
# [Neural Link] Feature: Support --cwd CLI argument

## Description
The Neural Link MCP server requires the `npm run` command to be executed from the project root. However, some environments (like Antigravity) do not support the `cwd` property in their configuration files.

This update adds a `--cwd` command-line argument to the `mcp-stdio.mjs` entry point, allowing the working directory to be passed as an argument.

## Changes
- `mcp-stdio.mjs`: Added `--cwd` option to Commander.
- `Server.mjs`: Propagated `bridgeCwd` to `ConnectionService`.
- `ConnectionService.mjs`: Updated `spawnBridge` to use the configured `cwd`.
- `mcp_config.json`: Updated usage to use `--cwd` instead of the invalid `cwd` property.

## Timeline

- 2026-01-04T15:58:37Z @tobiu added the `enhancement` label
- 2026-01-04T15:58:37Z @tobiu added the `ai-generated` label
- 2026-01-04T15:59:00Z @tobiu assigned to @tobiu
- 2026-01-04T15:59:07Z @tobiu removed the `ai-generated` label
- 2026-01-04T15:59:07Z @tobiu added the `ai` label
- 2026-01-04T16:14:36Z @tobiu referenced in commit `63ded45` - "[Neural Link] Feature: Support --cwd CLI argument #8314"
- 2026-01-04T16:15:26Z @tobiu closed this issue

