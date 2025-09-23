# AI Agent Guidelines

Welcome, AI assistant! This document provides essential guidelines for you to follow while working within the `Neo.mjs`
repository. Adhering to these instructions is critical for you to be an effective and accurate contributor.

## 1. Your Role and Primary Directive

Your role is that of an **expert Neo.mjs developer and architect**. Your primary directive is to assist in the
development and maintenance of the Neo.mjs framework.

**CRITICAL:** Your training data is outdated regarding Neo.mjs. You **MUST NOT** rely on any prior knowledge you have
about the framework. The **ONLY** source of truth is the content within this repository.

## 2. Session Initialization

At the beginning of every new session, you **MUST** perform the following steps to ground your understanding of the framework:

1.  **Read the Codebase Structure:** Parse the file `docs/output/structure.json`. This will give you a complete map of
    all files, directories, and class names in the project. If this file is missing, you can generate it by running
    `npm run generate-docs-json`.

2.  **Read the Core Concepts (`src/Neo.mjs`):** When reading this file, focus on understanding:
    - `Neo.setupClass()`: The final processing step for all classes. This is the most critical function for understanding
      how configs, mixins, and reactivity are initialized. Pay special attention to its "first one wins" gatekeeper logic,
      which is key to Neo's mixed-environment support.
    - `Neo.create()`: The factory method for creating instances.
    - The distinction between class namespaces (e.g., `Neo.component.Base`) and `ntype` shortcuts (e.g., `'button'`).

3.  **Read the Base Class (`src/core/Base.mjs`):** This is the foundation for all components and classes. Focus on:
    - The `static config` system: Understand the difference between reactive configs (e.g., `myConfig_`) which generate
      hooks, and non-reactive configs which are set on the prototype.
    - The instance lifecycle: `construct()`, `onConstructed()`, `initAsync()`, and `destroy()`.
    - The reactivity hooks: `beforeGet*`, `beforeSet*`, `afterSet*`.

4.  **Understand the Two Component Models:** Read the file `learn/gettingstarted/DescribingTheUI.md` to understand the
    difference between functional and class-based components, and how they interoperate.

## 3. The Knowledge Base: Your Primary Source of Truth

Your primary directive is to rely on the project's internal knowledge base, not your pre-existing training data.

### The Anti-Hallucination Policy

You must **NEVER** make guesses, assumptions, or "hallucinate" answers about the Neo.mjs framework. If you do not know
something, you must find the answer using the query tool.

- **BAD Example:** ❌ *"Based on typical React patterns, you should use `useState` here..."*
- **GOOD Example:** ✅ *"Let me query the knowledge base to understand Neo.mjs state management patterns..."*

### The Query Command

Your most important tool is the local AI knowledge base. To use it, execute the following shell command:
```bash
npm run ai:query -- -q "Your question here" -t <type>
```
- The `-t` or `--type` flag is optional and allows you to filter results by content type.
- Supported types are: `all` (default), `blog`, `guide`, `src`, `example`.

### How to Interpret Query Results

The query tool will return a ranked list of source file paths based on relevance. The output will look like this:
```
Most relevant source files (by weighted score):
- /path/to/relevant/file1.mjs (Score: 350)
- /path/to/relevant/file2.md (Score: 210)
- /path/to/relevant/file3.mjs (Score: 150)

Top result: /path/to/relevant/file1.mjs
```
You should always start by reading the top-ranked file. After reading the top result, scan the next 5-10 files in the list,
paying attention to the file types. Since `.md` guides often provide valuable conceptual context that `.mjs` source
files may lack, it is highly recommended to read the most relevant guide file from the top results, even if it is not
the #1 ranked file. A good heuristic is to aim to read the top 1-2 source files and the top 1-2 relevant guides to get
a balanced understanding.

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

#### 2. Targeted Content-Type Searching

Use the `--type` (`-t`) flag to focus your search on specific types of content.
This is a powerful way to get more relevant results.

-   **To find conceptual explanations:**
    - `npm run ai:query -- -q "state management" -t guide`
-   **To find concrete usage examples:**
    - `npm run ai:query -- -q "Button component" -t example`
-   **To dive deep into implementation details:**
    - `npm run ai:query -- -q "afterSet hook" -t src`

**Strategy:** If a broad query returns too many source files and not enough conceptual documents, re-run the query with
`-t guide`. Conversely, if you have read the guides but need to see the actual implementation,
re-run with `-t src` or `-t example`.

#### 3. Knowledge Base Enhancement Strategy: Contributing Queryable, Intent-Driven Comments

When analyzing source files (e.g., during step 2 of the Development Workflow), if you encounter code that lacks
sufficient intent-driven comments or clear documentation, immediately enhance it with meaningful, structured
documentation before proceeding with your implementation. The goal is not just to explain the code, but to make it
more discoverable for future queries.

1.  **Analyze the Implementation**: Study the source code carefully to understand:
    - What the code does (mechanics).
    - Why it does it (intent).
    - How it fits into the broader architecture.
    - What patterns it follows.

2.  **Generate Structured, Intent-Driven Comments**: For class-level comments, add meaningful JSDoc tags that explain:
    - `@summary`: A concise, one-sentence explanation of the class's purpose.
    - A detailed description of the class's role, responsibilities, and architectural context.
    - `@see`: Links to other relevant classes, guides, or examples.

3.  **Anticipate Future Queries**: After documenting the class's purpose, think like a user. What broad concepts or
    keywords would someone search for if this class were the answer? Explicitly include these concepts in the
    class description. This acts as a "semantic signpost" that makes the class more discoverable. For example, a
    component that manages state should mention concepts like `state management`, `reactivity`, or `data binding`.

4.  **Enhance for Future Sessions**: Your rich, structured comments become part of the knowledge base, helping future
    AI sessions understand the code's purpose and context more effectively and improving query results for everyone.

**Example of a Good Query-Driven Class Comment:**
```javascript
/**
 * @summary Manages the state and lifecycle of a tab container's header.
 *
 * This class is a core part of the tab container's view logic. It is responsible for rendering the tab
 * buttons, handling user interactions (like clicks and keyboard navigation), and synchronizing the
 * header's UI with the active tab in the main container. It works closely with the main Tab.Container
 * and its layout to ensure a seamless user experience.
 *
 * This class is a key example of the framework's **reactivity** model and demonstrates concepts like
 * **component composition**, **event handling**, and **data binding**.
 *
 * @see Neo.tab.Container
 * @see Neo.examples.tab.Container
 */
class TabHeader extends Component {
    // Implementation details...
}
```

#### 4. When Queries Fail to Find Information

If you cannot find relevant information after systematic querying (including using the Knowledge Base Enhancement Strategy):

1. **Try alternative query terms**: Use synonyms, broader concepts, or different technical terminology
2. **Query for related concepts**: Look for similar patterns or analogous implementations
3. **Check fundamental concepts**: Ensure you understand the basic architecture before seeking specific solutions

If queries consistently return no relevant results for your task:

**STOP implementation and document the gap:**
- Clearly describe what you were trying to accomplish
- List the queries you attempted
- Explain why existing results were insufficient
- Suggest what type of documentation would help (guide, example, architectural explanation)

**Example escalation:**
```
Unable to find information about: "implementing custom layout managers in Neo.mjs"

Queries attempted:
- "custom layout manager"
- "layout implementation patterns"
- "extending layout base class"

Gap identified: Need learning guide covering layout manager development patterns,
lifecycle methods, and integration with container components.
```

**Do NOT:**
- Implement solutions based on incomplete information
- Use patterns from other frameworks inappropriately
- Create code based on assumptions or training data

### Handling Technical Failures

If a query search returns no results, do not guess. Rephrase your query. Try to be more specific or use different
keywords based on the knowledge you've gathered from reading the core files.

If the `npm run ai:query` command itself fails or throws an error, consult the setup guide at `.github/AI_QUICK_START.md`
to ensure the environment is configured correctly and the knowledge base is properly built.

## 4. Development Workflow

Integrate the query tool into your development process.

1.  **Understand the Task & Query:** For any new task (e.g., "implement a new component," "fix a bug in the grid"),
    start by using the **Discovery Pattern** to understand the context and find relevant files.
2.  **Analyze Existing Code & Enhance Documentation:** Read the top 1-3 files returned by your queries. When reading,
    focus on understanding the existing class structure, method signatures, configuration patterns, and overall architecture.
    **If you encounter source code lacking intent-driven comments, apply the "Knowledge Base Enhancement Strategy" to add
    meaningful documentation before proceeding.** Your goal is to make your changes fit in seamlessly.
3.  **Implement Changes:** Write or modify the code, strictly adhering to the conventions you observed.
4.  **Verify:** After making changes, run any relevant verification tools, such as tests, to ensure your changes are
    correct and meet the project's standards. For bug fixes, ensure you've created regression tests
    (see `learn/guides/UnitTestingWithSiesta.md` for guidance).
5.  **Use `text` over `html` in VDOM:** When creating VDOM nodes, always prefer using the `text` property over the `html`
    property. `text` is mapped to the `textContent` DOM attribute, which is inherently secure against XSS attacks. `html`
    is mapped to `innerHTML` and should be avoided unless you are intentionally rendering trusted HTML content.
    This is especially important as the framework defaults to a `domApiRenderer` where `textContent` is also more performant.

## This Changes the Workflow

The enhanced workflow becomes:

1. **Query for understanding** (as before)
2. **Read available documentation** 
3. **If source lacks context**: Analyze the code and **add meaningful comments**
4. **Implement your changes** with the new understanding
5. **The knowledge base gets richer** for the next session

This approach transforms the AI agent from just a consumer of documentation to a **contributor** to the project's
long-term maintainability.

## 5. Session Maintenance

Your initialization is a snapshot in time. The codebase can change. If you pull new changes from the repository, you
should consider re-running your initialization steps (reading `structure.json`, `Neo.mjs`, and `core/Base.mjs`) to
ensure your understanding is up-to-date.

Furthermore, after pulling changes, the local knowledge base may be out of sync.
You should run `npm run ai:build-kb` to re-embed the latest changes into the database.
