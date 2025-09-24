# Implement AI Knowledge Base Support for Workspaces

GH ticket id: #7245

**Assignee:** Gemini
**Status:** Done

## Description

## Task
Implement AI knowledge base support for a Neo.mjs workspace.

## Scope
Extend the existing AI knowledge base functionality, currently implemented for the `neo` repository, to a generic workspace structure. This involved:

1.  **Modifying the `create-app` project:**
    *   Updated `create-app/tasks/createPackageJson.mjs` to include the latest `devDependencies` from the `neo` repo and added alphabetically sorted `ai:*` scripts.
    *   Modified `create-app/tasks/neo-app.mjs` to copy `AGENTS.md` to the workspace root, create the `chroma` directory, and copy `AI_QUICK_START.md` to the workspace's `.github` folder.
    *   Updated `create-app/tasks/createGitignore.mjs` to include `.env` and `chroma/` in the generated `.gitignore` file.

2.  **Adapting AI scripts within the `neo` repository:**
    *   Refactored `neo/buildScripts/ai/createKnowledgeBase.mjs`, `embedKnowledgeBase.mjs`, and `queryKnowledgeBase.mjs` to use `process.env.npm_package_name` for the `insideNeo` check.
    *   Modified `dotenv.config()` calls in these scripts to dynamically load `.env` files from the correct location (either the `neo` repo root or two levels up for a workspace).

3.  **Establishing and applying formatting consistency:**
    *   Agreed upon and applied a convention for column-based alignment in `package.json` files across the project, specifically re-formatting `neo/package.json` to adhere to this standard.

These changes ensure that newly generated Neo.mjs workspaces are fully equipped with AI knowledge base capabilities, including proper environment variable handling and documentation.

## Goal
Enable AI agents to effectively use the knowledge base within any Neo.mjs workspace, improving their ability to understand and contribute to workspace-specific projects and reducing hallucination.
