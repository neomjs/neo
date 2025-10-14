---
title: Refactor to an MCP Tool-Providing Server
labels: enhancement, AI, refactoring
---

GH ticket id: #7386

**Epic:** #7477
**Phase:** 3
**Assignee:** tobiu
**Status:** To Do

## Description

The server currently functions as a standard REST API, which forces the agent to use `curl`. This is inefficient and does not align with the Model Context Protocol (MCP) vision.

This ticket covers the refactoring of the server to become a true MCP-compliant, tool-providing server. It will parse its own `openapi.yaml` to dynamically expose its capabilities as tools for the agent.

## Acceptance Criteria

1.  A new `toolService.mjs` is created that can parse the `openapi.yaml` and map API endpoints to their underlying service functions.
2.  A new `tools.mjs` route is created.
3.  A `GET /tools/list` endpoint is implemented. It returns a JSON array of available tools, derived from the OpenAPI spec.
4.  A `POST /tools/call` endpoint is implemented. It receives a `toolName` and `arguments`, executes the correct service function, and returns the result.
5.  The existing REST endpoints (e.g., `/pull-requests`, `/labels`) remain functional for now but are considered deprecated for agent use.
