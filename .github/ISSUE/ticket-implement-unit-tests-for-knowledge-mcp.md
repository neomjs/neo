---
title: Implement Integration Tests for Knowledge MCP Server using Playwright
labels: enhancement, AI, testing
---

GH ticket id: #XXXX

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 2
**Assignee:**
**Status:** To Do

## Description

To ensure the reliability and correctness of the new Knowledge Base MCP server, a comprehensive suite of integration tests must be created using the project's established Playwright testing framework.

The tests should launch the MCP server as a background process, then use Playwright's `request` context to make live HTTP requests to the server's API endpoints. This will validate the entire workflow, from the HTTP layer down to the ChromaDB interaction.

## Acceptance Criteria

1.  Playwright integration tests are created for all API endpoints.
2.  A new test file is created (e.g., `test/playwright/mcp/knowledge-server.spec.mjs`).
3.  Tests cover successful requests and expected JSON responses.
4.  Tests cover error conditions, such as invalid requests or failures in the underlying ChromaDB connection.
5.  A new script, `npm run test:mcp-knowledge`, is added to `package.json` to run these specific tests.
6.  The tests are integrated into the existing Playwright test suite.
