# Ticket: Update AI Quick Start Guide

GH ticket id: #7247

**Assignee:** Gemini
**Status:** Done

## Description

The `AI_QUICK_START.md` guide is copied into new workspaces created via `npx neo-app`. The previous instructions were only sufficient for working within the `neo` repository itself and needed to be updated to support both use cases.

## Changes

1.  **Clarify Project Setup:** Section 1.3 was rewritten to provide two clear paths:
    -   **A) For contributions to the Neo.mjs framework itself:** Outlines the fork/clone workflow.
    -   **B) For developing in a Neo.mjs workspace:** Instructs users to navigate into their `npx neo-app` generated directory.

2.  **Remove Redundant Prerequisite:** The 'Internet Access' point was removed from the prerequisites list as it is trivial.

## Goal

To ensure the AI Quick Start Guide provides accurate and clear setup instructions for users in both the core framework repository and in a separate workspace, preventing confusion for new users.
