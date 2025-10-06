---
title: Enhance Knowledge Base to Include GitHub Comments
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7378

**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 4
**Status:** To Do

## Description

The comments on GitHub issues and PRs contain invaluable context, debates, and decision-making history. To make this information discoverable by the agent, we need to ingest these comments into our local knowledge base (ChromaDB). This ticket is to enhance the knowledge base creation process to include comments.

## Acceptance Criteria

1.  The `buildScripts/ai/createKnowledgeBase.mjs` script, or a new supplementary script, is updated.
2.  The script will use the `gh` CLI to fetch comments for each issue/PR being ingested (e.g., `gh issue view <ID> --comments`).
3.  Each comment should be processed into a new, separate "chunk" for the knowledge base JSONL file.
4.  Each comment chunk must be linked to its parent issue/PR chunk to maintain context (e.g., via a `parentId` field).
5.  This ensures that a semantic search for a topic will return not only the original ticket but also the relevant discussion from the comments.
