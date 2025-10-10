# Ticket: Create Empty Viewport App for Component Tests

GH ticket id: #7437

**Assignee:**
**Status:** To Do

**Parent Epic:** epic-migrate-component-tests-to-playwright.md

## Description

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns:
https://github.com/neomjs/neo/issues/7435

As part of the component test harness, a minimal Neo.mjs application is required to act as the host, or "empty viewport," for the dynamically created components under test.

## Acceptance Criteria

1.  Create a new, minimal application at `test/apps/component-test-app/app.mjs`.
2.  This application should consist of a single, empty `Neo.container.Viewport`.
3.  The application's `index.html` should be configured to load this app.
4.  The `webServer` in the Playwright config should point to this application's entry point.
