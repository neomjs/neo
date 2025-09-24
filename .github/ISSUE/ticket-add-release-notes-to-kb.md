# Ticket: Add Release Notes to AI Knowledge Base

GH ticket id: #7241

**Assignee:** Gemini
**Status:** Done

## Description

To enrich the historical context of the AI knowledge base, this task involves integrating the framework's release notes into the embedding and querying process.

This will enable developers and AI agents to ask questions about when specific features were introduced or changed.

## Scope of Work

1.  **Enhance `embedKnowledgeBase.mjs`:**
    -   Modify the script to read all markdown files from the `.github/RELEASE_NOTES/` directory.
    -   For each file, create a new chunk object with a `type` of `release`.
    -   The chunk's `name` should be derived from the filename (e.g., `v10.8.0.md` -> `v10.8.0`).
    -   The chunk's `content` will be the full content of the markdown file.
    -   Add these new chunks to the `dist/ai-knowledge-base.jsonl` file during the creation process.

2.  **Enhance `queryKnowledgeBase.mjs`:**
    -   Update the `commander` setup to accept `release` as a new valid value for the `--type` option.
    -   Add a case in the filtering logic to handle `type: 'release'`, filtering the results to only include chunks where the `source` path includes `/.github/RELEASE_NOTES/`.

## Acceptance Criteria

-   Running `npm run ai:build-kb` successfully processes and embeds the release notes.
-   Running `npm run ai:query -- -q "<some feature>" -t release` returns relevant release notes.
-   The system remains stable and existing functionality is unaffected.
