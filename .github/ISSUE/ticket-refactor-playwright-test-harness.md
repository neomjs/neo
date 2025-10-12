---
title: 'Refactor: Consolidate and Refine Playwright Test Harness'
labels: enhancement, AI
---

GH ticket id: #7469

**Epic:** Migrate Component Tests from Siesta to Playwright (R&D)
**Phase:** 1
**Assignee:** tobiu
**Status:** Done

## Description

This task covers the architectural refactoring and consolidation of the Playwright component test harness. After the initial implementation of the "empty viewport" app, we identified several key improvements to create a more logical and scalable structure for our new testing suite.

**Key Changes Implemented:**
1.  **Consolidated Directory Structure:** The test harness application was moved from `test/apps/` to a dedicated, co-located home at `test/playwright/component/apps/empty-viewport/`. This ensures all Playwright-related artifacts reside in a single, intuitive location.
2.  **Architectural Simplification:** The harness was simplified by removing the unnecessary `EmptyViewport.mjs` subclass and using the framework's base `Neo.container.Viewport` directly.
3.  **Configuration Cleanup:** The `neo-config.json` for the harness was cleaned up to remove redundant settings and rely on the framework's defaults from `src/DefaultConfig.mjs`.
4.  **Strategy Documentation:** The main epic (`epic-migrate-component-tests-to-playwright.md`) was updated to reflect these structural changes and to formally document the new **hybrid testing strategy** for complex components.
