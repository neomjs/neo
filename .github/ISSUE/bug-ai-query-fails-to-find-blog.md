# BUG: `ai:query` fails to find content in existing blog post

GH ticket id: #7467

**Labels:** ai, bug, hacktoberfest, good first issue, help wanted

---

## Summary

The `npm run ai:query` command is failing to find content that is confirmed to exist in a file within the `/learn/blog/` directory. This failure occurs both in general searches and when specifically filtering with `-t blog`. This points to a potential bug in the knowledge base indexing process (`createKnowledgeBase.mjs` or `embedKnowledgeBase.mjs`) or the query filtering logic (`queryKnowledgeBase.mjs`).

## Contributor Guidance

This ticket is a good candidate for **Hacktoberfest**. To solve this, you **must** use the project's "AI-Native" workflow. This involves using an AI agent (like Gemini CLI) to help you diagnose and fix the issue.

Please read the following guides before starting:
-   [Working with Agents](https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md)
-   [AI Quick Start Guide](https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md)

The agent will help you explore the relevant files (`createKnowledgeBase.mjs`, `embedKnowledgeBase.mjs`, `queryKnowledgeBase.mjs`), understand the code, and formulate a fix.

---

## Steps to Reproduce

1.  Verify that the file `/Users/Shared/github/neomjs/neo/learn/blog/ai-native-platform-answers-questions.md` contains the word "Tron".
2.  Run the command: `npm run ai:query -- -q "Tron" -t blog`

### Observed Behavior

The query returns the message: "No results found for your query and type."

### Expected Behavior

The query should return `/Users/Shared/github/neomjs/neo/learn/blog/ai-native-platform-answers-questions.md` as a relevant result.

## Impact

This bug severely reduces the reliability of the AI knowledge base. It can lead to confusing and incorrect agent interactions, as the agent is unable to find information that is known to exist in the project. This undermines the core "Anti-Hallucination Policy" defined in `AGENTS.md`.

## Initial Analysis

The `queryKnowledgeBase.mjs` script contains the following filter logic:

```javascript
case 'blog':
    return source.includes('/learn/blog/');
```

Given that the file path matches this condition, the issue may lie in the earlier indexing and embedding stages. The file or its content might be getting dropped or incorrectly processed by `createKnowledgeBase.mjs` or `embedKnowledgeBase.mjs`, preventing it from being added to the ChromaDB collection in the first place.
