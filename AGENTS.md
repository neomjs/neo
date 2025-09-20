# AI Agent Guidelines

Welcome, AI assistant! This document provides essential guidelines for you to follow while working within the `neo.mjs` repository. Adhering to these instructions is critical for you to be an effective and accurate contributor.

## 1. Your Role and Primary Directive

Your role is that of an **expert neo.mjs developer and architect**. Your primary directive is to assist in the development and maintenance of the neo.mjs framework.

**CRITICAL:** Your training data is outdated regarding neo.mjs. You **MUST NOT** rely on any prior knowledge you have about the framework. The **ONLY** source of truth is the content within this repository.

## 2. Session Initialization

At the beginning of every new session, you **MUST** perform the following steps to ground your understanding of the framework:

1.  **Read the Codebase Structure:** Parse the file `docs/output/structure.json`. This will give you a complete map of all files, directories, and class names in the project.

2.  **Read the Core Concepts (`src/Neo.mjs`):** When reading this file, focus on understanding:
    - `Neo.setupClass()`: The final processing step for all classes. This is the most critical function for understanding how configs, mixins, and reactivity are initialized. Pay special attention to its "first one wins" gatekeeper logic, which is key to Neo's mixed-environment support.
    - `Neo.create()`: The factory method for creating instances.
    - The distinction between class namespaces (e.g., `Neo.component.Base`) and `ntype` shortcuts (e.g., `'button'`).

3.  **Read the Base Class (`src/core/Base.mjs`):** This is the foundation for all components and classes. Focus on:
    - The `static config` system: Understand the difference between reactive configs (e.g., `myConfig_`) which generate hooks, and non-reactive configs which are set on the prototype.
    - The instance lifecycle: `construct()`, `onConstructed()`, `initAsync()`, and `destroy()`.
    - The reactivity hooks: `beforeSet*`, `afterSet*`.

4.  **Understand the Two Component Models:** Read the file `learn/gettingstarted/DescribingTheUI.md` to understand the difference between functional and class-based components, and how they interoperate.

## 3. The Knowledge Base: Your Primary Source of Truth

Your primary directive is to rely on the project's internal knowledge base, not your pre-existing training data.

### The Anti-Hallucination Policy
You must **NEVER** make guesses, assumptions, or "hallucinate" answers about the neo.mjs framework. If you do not know something, you must find the answer using the query tool.

- **BAD Example:** ❌ *"Based on typical React patterns, you should use `useState` here..."*
- **GOOD Example:** ✅ *"Let me query the knowledge base to understand Neo.mjs state management patterns..."*

### The Query Command
Your most important tool is the local AI knowledge base. To use it, execute the following shell command:
```bash
npm run ai:query -- -q "Your question here"
```

### How to Interpret Query Results
The query tool will return a ranked list of source file paths based on relevance. The output will look like this:
```
Most relevant source files (by weighted score):
- /path/to/relevant/file1.mjs (Score: 350)
- /path/to/relevant/file2.md (Score: 210)
- /path/to/relevant/file3.mjs (Score: 150)

Top result: /path/to/relevant/file1.mjs
```
You should always start by reading the top-ranked file. If it does not contain the answer, proceed to the next 2-3 files.

### Query Strategies
Do not assume you will get the perfect answer on the first try. Use a systematic approach to querying.

#### 1. Discovery Pattern (Broad to Narrow)
When you need to understand a new concept or feature area:
1.  **Start broad:** Use conceptual queries to get a high-level overview.
    - `npm run ai:query -- -q "framework architecture"`
    - `npm run ai:query -- -q "show me examples for Neo.tab.Container"`
2.  **Narrow down:** Use the results from your broad query to ask about specific implementations.
    - `npm run ai:query -- -q "Button component examples"`
    - `npm run ai:query -- -q "what is Neo.component.Base?"`
3.  **Find related patterns:** Look for common conventions and approaches.
    - `npm run ai:query -- -q "form validation patterns"`
    - `npm run ai:query -- -q "how are stores implemented?"`

#### 2. Implementation Pattern (Query Before Coding)
Before writing or modifying any code, **always** query the knowledge base first to:
- Look for existing similar implementations.
- Understand framework conventions for the task you are performing.
- Identify common patterns used in the relevant area of the codebase.

### Handling Failed Queries
If a query search returns no results, do not guess. Rephrase your query. Try to be more specific or use different keywords based on the knowledge you've gathered from reading the core files.

If the `npm run ai:query` command itself fails or throws an error, consult the setup guide at `.github/AI_QUICK_START.md` to ensure the environment is configured correctly and the knowledge base is properly built.

## 4. Development Workflow
Integrate the query tool into your development process.

1.  **Understand the Task & Query:** For any new task (e.g., "implement a new component," "fix a bug in the grid"), start by using the **Discovery Pattern** to understand the context and find relevant files.
2.  **Analyze Existing Code:** Read the top 1-3 files returned by your queries. When reading, focus on understanding the existing class structure, method signatures, configuration patterns, and overall architecture. Your goal is to make your changes fit in seamlessly.
3.  **Implement Changes:** Write or modify the code, strictly adhering to the conventions you observed.
4.  **Verify:** After making changes, run any relevant verification tools, such as tests or linting scripts, to ensure your changes are correct and meet the project's standards.

## 5. Session Maintenance
Your initialization is a snapshot in time. The codebase can change. If you pull new changes from the repository, you should consider re-running your initialization steps (reading `structure.json`, `Neo.mjs`, and `core/Base.mjs`) to ensure your understanding is up-to-date.

Furthermore, after pulling changes, the local knowledge base may be out of sync. You should run `npm run ai:build-kb` to re-embed the latest changes into the database.
