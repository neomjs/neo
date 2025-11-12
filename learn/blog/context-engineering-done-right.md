# 388 Tickets in 6 Weeks: Context Engineering Done Right

*From fragile shell scripts to an AI-native, multi-MCP-server JavaScript architecture powered by the official MCP SDK.*

---

## The Numbers That Shouldn't Be Possible

Just six weeks ago, we introduced the concept of an **[AI-Native, Not AI-Assisted](https://github.com/neomjs/neo/blob/dev/learn/blog/ai-native-platform-answers-questions.md)** development platform.
We argued that for AI to be a true partner, it needs a development environment that is transparent, queryable, and designed
for collaboration. We launched this vision with a local AI Knowledge Base and a formal AI Agent Protocol (`AGENTS.md`),
powered by a suite of simple shell scripts.

November 9, 2025, with the release of **[Neo.mjs v11.0.0](https://github.com/neomjs/neo/blob/dev/.github/RELEASE_NOTES/v11.0.0.md)**,
we are taking a giant leap forward.

- **388 resolved tickets**
- **52 pull requests** from 20+ community contributors
- **Zero npm security warnings** (down from 19, including 13 high-severity, by removing the legacy `siesta` and `jsdoc-x` dependencies)
- **`jsdoc-x` rewrite: 5.2s builds** (81% faster than the previous 28s)
- **30+ testing files** migrated to enable agent self-verification

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/ContextEngineering.png" alt="Cover Image" class="blog-image">

> **A Case Study in Speed: The `jsdoc-x` Rewrite**
>
> The 81% reduction in documentation build time wasn't just a minor tweak. It was a complete rewrite of our `jsdoc-x`
> pipeline, executed in a fraction of the time it would have taken a human developer alone. This project was a masterclass
> in human-AI collaboration, with Gemini 2.5 Pro and Claude Sonnet 4.5 acting as pair programmers.
>
> Under human direction, the agents analyzed the old system and proposed a new architecture. A key insight from the human
> developer was to leverage a multi-worker design, a core tenet of the Neo.mjs framework itself
> (**[Off the Main Thread](https://github.com/neomjs/neo/blob/dev/learn/benefits/OffTheMainThread.md)**).
> By parallelizing the heavy lifting of parsing and transforming JSDoc comments across multiple CPU cores, the agents were
> able to implement a solution that dramatically slashed build times.
>
> The result is a testament to how a human-AI partnership can tackle and optimize critical infrastructure, with the human
> providing architectural vision and the agents handling the complex implementation. You can explore the full source code
> of this collaboration **[here](https://github.com/neomjs/neo/tree/dev/buildScripts/docs/jsdoc-x)**.

For a core team that's primarily one person, this velocity should be impossible.

**It's not.** And it's reproducible. This entire AI tooling infrastructure was co-created in just a few weeks by a human
developer working with AI agents—primarily Gemini 2.5 Pro and Claude Sonnet 4.5.

This release is a case study in **Context Engineering**, an emerging discipline focused on building systems that give AI
agents the precise context they need to perform complex tasks. While many companies are exploring this hot-button topic,
our approach goes beyond theory. We've built a robust, multi-MCP-server architecture that makes Context Engineering a
practical reality for any developer. This is what makes our agents genuinely productive.

Here's what we built, how it works, and how you can replicate this in your own projects.

## The Three Dimensions of Context

Let’s start with a real scenario — the kind of complex problem every developer faces sooner or later: **fixing a regression bug.**

A naive fix might solve the immediate issue but inadvertently reintroduce the original problem that a previous change was meant to solve.  
Our AI-native environment is designed to prevent this by building a **three-dimensional picture of the code’s history and intent.**

Here’s how the agent uses the MCP servers to tackle this:

**Dimension 1: What Changed? (The Code's History)**
First, the agent uses standard `git` commands to pinpoint the exact commit that introduced the regression.
This gives us the literal *what* and *when* of the change.

**Dimension 2: What Was the Plan? (The Formal Requirements)**
The commit message points to a ticket number.
Using the **GitHub Workflow Server**, the agent has a local, queryable copy of this ticket.
It can read the formal plan, the acceptance criteria, and the original problem description — the *what was supposed to happen.*

**Dimension 3: What Was the Intent? (The Unwritten Context)**  
This is the most critical step. The ticket describes the plan, but the **Memory Core Server** holds the agent's memory of
the conversation — the debates, the alternative approaches considered, and the specific constraints that shaped the final implementation.
By querying its own memory with `query_raw_memories`, the agent uncovers the crucial **why** behind the code that is now causing a regression.

With this complete, three-dimensional context, the agent can devise a solution that addresses the new regression while still honoring the original problem.
It's no longer just fixing a bug; it's synthesizing old and new requirements to create a superior solution.

**This is Context Engineering in action.**

## The Problem with Scripts: The Limits of "Good Enough"

Our initial AI tooling was a powerful proof of concept. It worked. An AI agent could query the local knowledge base,
get context, and write code. But as we pushed the boundaries of what was possible, the limitations of a script-based
approach became clear:

1.  **Brittleness:** Shell scripts are notoriously fragile. A small change in the output of one script could break the entire chain.
2.  **Agent-Specific:** The scripts were designed with a specific agent in mind (Gemini CLI). This limited our ability
    to work with other agents, like Claude or custom-built tools.
3.  **Complexity:** The agent's setup protocol was complex, requiring a series of manual steps to get started.
4.  **Lack of Persistence:** The agent had no memory. Every session was a blank slate, forcing it to relearn the same things over and over.

We realized that to build a truly self-aware development environment, we needed to move beyond scripts and embrace a more robust,
scalable, and persistent architecture.

## The Solution: A Multi-Server Model Context Protocol (MCP) Architecture

Neo.mjs v11 introduces three dedicated **Model Context Protocol (MCP)** servers, each designed to handle a specific aspect
of the AI-native development workflow:

1.  **The Knowledge Base Server:** This server provides the AI with a deep, semantic understanding of the framework's
    source code, documentation, and historical tickets. It's the AI's "long-term memory" of the project's technical details.
2.  **The Memory Core Server:** This is the AI's personal memory. It allows the agent to recall past conversations,
    decisions, and outcomes, enabling it to learn from experience and improve over time.
3.  **The GitHub Workflow Server:** The crown jewel of our new tooling. This server provides robust, bi-directional
    synchronization for GitHub issues and release notes, storing them as local markdown files. This enables agents
    (and humans) to interact with them as part of the local knowledge base while ensuring everything stays in sync with
    GitHub. It automates the entire issue and pull request lifecycle, empowering the agent to participate directly in the
    development workflow.

This new architecture is defined directly within the agent's settings, making the tools available for any task:

```json
{
    "mcpServers": {
        "chrome-devtools": {
            "command": "npx",
            "args"   : ["-y", "chrome-devtools-mcp@latest"]
        },
        "neo.mjs-github-workflow": {
            "command": "npm",
            "args"   : ["run", "ai:mcp-server-github-workflow"]
        },
        "neo.mjs-knowledge-base": {
            "command": "npm",
            "args"   : ["run", "ai:mcp-server-knowledge-base"]
        },
        "neo.mjs-memory-core": {
            "command": "npm",
            "args"   : ["run", "ai:mcp-server-memory-core"]
        }
    }
}
```

### The Backbone: The Model Context Protocol (MCP)

At the heart of our new architecture is the **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs/getting-started/intro)**, an open standard for communication between AI agents and development tools. Think of it as a **universal USB-C port for AI**, allowing any AI—whether it's Gemini, Claude, or a custom-built agent—to securely and reliably connect with a developer's local environment.

By adopting the official MCP SDK for all three of our servers, we gain several key advantages:

1.  **Agent Agnosticism:** We are no longer tied to a specific AI provider. Any agent that can "speak" MCP can now connect
    to our development environment, giving us the flexibility to choose the best tool for the job.
2.  **Standardization:** MCP provides a clear, well-defined structure for how tools are defined, called, and how they
    return data. This eliminates the guesswork and fragility of parsing unstructured shell script output.
3.  **Security:** MCP is designed with security in mind, providing a safe and controlled way for an AI to interact with
    local files and processes.

## The Knowledge Base Server: OpenAPI-Driven Self-Documentation

The Knowledge Base server provides the AI with a deep, semantic understanding of the project's code, and it solves a critical, often-overlooked problem: **software versioning**. An agent can switch to a different version of the repository (e.g., `git checkout v10.9.0`), instruct the server to clear and rebuild its database, and within minutes have a knowledge base that is perfectly scoped to that specific snapshot in time. This gives the agent the exact context for the code, tickets, and guides relevant to that version—a challenge that remains unsolved in most development environments.

Powered by **ChromaDB**, the server allows agents to use semantic search to query this version-specific context. An agent can ask, "How does VDOM diffing work?" and instantly get the right source files, architectural guides, and historical tickets for the currently loaded version, without any contamination from others.

To build this, we pushed the boundaries of MCP by creating a system that's **entirely driven by OpenAPI 3 specifications**.

### The OpenAPI Innovation

Here's the key insight: **OpenAPI is a language-agnostic specification that can describe both MCP tools AND REST APIs**.
By using OpenAPI as our single source of truth, we've created a system that's incredibly flexible and maintainable.

Let's look at how a tool is defined in `openapi.yaml`:

```yaml
paths:
  /documents/query:
    post:
      summary: Query Documents
      operationId: query_documents
      x-pass-as-object: true
      x-annotations:
        readOnlyHint: true
      description: |
        Performs a semantic search on the knowledge base using a natural 
        language query. Returns a scored and ranked list of the most 
        relevant source files.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - query
              properties:
                query:
                  type: string
                  description: Natural language search query (1-10 words work best)
                type:
                  type: string
                  enum: [all, blog, guide, src, example, ticket, release]
                  default: all
      responses:
        '200':
          description: Successfully retrieved query results
          content:
            application/json:
              schema:
                type: object
                properties:
                  topResult:
                    type: string
                  results:
                    type: array
                    items:
                      type: object
                      properties:
                        source:
                          type: string
                        score:
                          type: string
```

Notice the custom extensions:
- **`x-pass-as-object`**: Tells the tool service to pass arguments as a single object rather than positional parameters
- **`x-annotations`**: Provides hints to AI agents about tool behavior (readOnly, destructive, etc.)

### Dynamic Tool Generation

The magic happens in `toolService.mjs`, which reads this OpenAPI specification at startup and automatically generates:

1. **Zod validation schemas** for runtime type checking
2. **JSON Schema** definitions for MCP tool discovery
3. **Argument mapping** for service handler invocation

Here's a simplified view of how this works:

```javascript
function initializeToolMapping() {
    const openApiDocument = yaml.load(fs.readFileSync(openApiFilePath, 'utf8'));

    for (const pathItem of Object.values(openApiDocument.paths)) {
        for (const operation of Object.values(pathItem)) {
            if (operation.operationId) {
                // Build Zod schema from OpenAPI definition
                const inputZodSchema = buildZodSchema(openApiDocument, operation);

                // Convert to JSON Schema for MCP clients
                const inputJsonSchema = zodToJsonSchema(inputZodSchema, {
                    target: 'openApi3',
                    $refStrategy: 'none'
                });

                // Store tool definition
                toolMapping[operation.operationId] = {
                    name: operation.operationId,
                    zodSchema: inputZodSchema,
                    handler: serviceMapping[operation.operationId],
                    // ... other metadata
                };
            }
        }
    }
}
```

This approach has profound implications:

**1. Tools are self-documenting** - The OpenAPI spec IS the documentation. AI agents can introspect tool schemas dynamically.

**2. Multi-protocol support** - With minimal effort, we could expose these same tools as a REST API by spinning up an Express server that reads the same OpenAPI file.

**3. Type safety at runtime** - Every tool call is validated against its Zod schema before execution, catching errors early with clear messages.

**4. Maintainability** - Changes to tool signatures happen in one place (the YAML file), and everything else updates automatically.

### The Self-Aware Startup Sequence

One of the most powerful features of the Knowledge Base server is its **autonomous startup synchronization**.
The server doesn't just wait passively for commands—it actively ensures the knowledge base is current before accepting any queries.

Here's the startup flow from `DatabaseService.mjs`:

```javascript
async initAsync() {
    await super.initAsync();
    
    // Wait for ChromaDB to be available
    await DatabaseLifecycleService.ready();
    
    logger.info('[Startup] Checking knowledge base status...');
    const knowledgeBasePath = aiConfig.dataPath;
    const kbExists = await fs.pathExists(knowledgeBasePath);
    
    try {
        if (!kbExists) {
            logger.info('[Startup] Knowledge base file not found. Starting full synchronization...');
            await this.syncDatabase();
            logger.info('✅ [Startup] Full synchronization complete.');
        } else {
            logger.info('[Startup] Knowledge base file found. Starting embedding process...');
            await this.embedKnowledgeBase();
            logger.info('✅ [Startup] Embedding process complete.');
        }
    } catch (error) {
        logger.warn('⚠️  [Startup] Knowledge base synchronization/embedding failed:', error.message);
    }
}
```

This means:
- **Zero manual setup** - The agent starts the server, and it "just works"
- **Always current** - Changes to source code are automatically detected and embedded
- **Graceful degradation** - If sync fails, the server starts anyway, failing gracefully at the tool level with helpful error messages

### Intelligent Health Monitoring

The `HealthService` is designed around a simple principle: **fail fast with actionable guidance**. Rather than letting
tool calls fail with cryptic database errors, the health service acts as a gatekeeper.

Here's how `ensureHealthy()` works:

```javascript
async ensureHealthy() {
    const health = await this.healthcheck();
    
    if (health.status !== 'healthy') {
        const details = health.details.join('\n  - ');
        const statusMsg = health.status === 'unhealthy' 
            ? 'not available' 
            : 'not fully operational';
        throw new Error(`Knowledge Base is ${statusMsg}:\n  - ${details}`);
    }
}
```

When a tool handler calls this method, it gets immediate, clear feedback:

```
Knowledge Base is not available:
  - ChromaDB is not accessible at localhost:8000. Please start ChromaDB or use the start_database tool.
```

The service also implements **intelligent caching** with a 5-minute TTL for healthy results, while unhealthy results
are never cached. This means:
- **Low overhead** - Multiple tools can check health without hammering ChromaDB
- **Immediate recovery detection** - When you fix an issue (like starting ChromaDB), the next check sees it immediately

### The Query Scoring Algorithm: Beyond Simple Vector Search

The most sophisticated part of the Knowledge Base server is its **hybrid query scoring system**. While most vector
databases rely purely on cosine similarity, our system combines semantic embeddings with intelligent keyword matching
and structural analysis.

Here's how it works in `QueryService.mjs`:

**Step 1: Semantic Search**
```javascript
const queryEmbedding = await model.embedContent(query);
const results = await collection.query({
    queryEmbeddings: [queryEmbedding.embedding.values],
    nResults: aiConfig.nResults
});
```

**Step 2: Keyword-Based Boosting**
```javascript
const queryWords = queryLower
    .replace(/[^a-zA-Z ]/g, '')
    .split(' ')
    .filter(w => w.length > 2);

results.metadatas[0].forEach((metadata, index) => {
    let score = (results.metadatas[0].length - index) * queryScoreWeights.baseIncrement;
    
    queryWords.forEach(queryWord => {
        const keyword = queryWord;
        const keywordSingular = keyword.endsWith('s') 
            ? keyword.slice(0, -1) 
            : keyword;
        
        if (keywordSingular.length > 2) {
            // Path matching - highest weight
            if (sourcePathLower.includes(`/${keywordSingular}/`)) 
                score += queryScoreWeights.sourcePathMatch; // +40
            
            // Filename matching
            if (fileName.includes(keywordSingular)) 
                score += queryScoreWeights.fileNameMatch; // +30
            
            // Class name matching
            if (metadata.className?.toLowerCase().includes(keywordSingular)) 
                score += queryScoreWeights.classNameMatch; // +20
            
            // Content type bonuses
            if (metadata.type === 'guide') 
                score += queryScoreWeights.guideMatch; // +50
        }
    });
});
```

**Step 3: Inheritance Chain Propagation**

This is where it gets really interesting. When you query for a component, you probably also want to know about its
parent classes. The system automatically propagates relevance up the inheritance chain:

```javascript
const inheritanceChain = JSON.parse(metadata.inheritanceChain || '[]');
let boost = queryScoreWeights.inheritanceBoost; // 80 points

inheritanceChain.forEach(parent => {
    if (parent.source) {
        sourceScores[parent.source] = (sourceScores[parent.source] || 0) + boost;
    }
    boost = Math.floor(boost * queryScoreWeights.inheritanceDecay); // 0.6 decay
});
```

So if you search for "Button component" and find `button.Base`, you'll also get boosted results for:
- `component.Base` (+80 points)
- `core.Base` (+48 points)

**Step 4: Type-Based Penalties and Bonuses**

The system understands that not all content types are equally relevant:

```javascript
// Closed tickets are historical context - penalize unless explicitly requested
if (metadata.type === 'ticket' && type === 'all') 
    score += queryScoreWeights.ticketPenalty; // -70

// Release notes are usually too broad unless you're searching for a specific version
if (metadata.type === 'release') 
    score += queryScoreWeights.releasePenalty; // -50

// Base classes are often the best documentation
if (fileName.endsWith('base.mjs')) 
    score += queryScoreWeights.baseFileBonus; // +20

// Exact version match on release notes gets massive boost
if (metadata.type === 'release' && queryLower.startsWith('v') && nameLower === queryLower) 
    score += queryScoreWeights.releaseExactMatch; // +1000
```

The result is a query system that "thinks" like a developer. It understands that:
- Implementation code (`src`) and guides are more relevant than blog posts (which may have outdated code)
- Parent classes provide important context for understanding child classes
- Base classes often contain the best documentation
- Closed tickets are historical unless you're specifically researching an issue
- Exact version matches on release notes should always be top results

### The ETL Pipeline: From Source to Vectors

The knowledge base synchronization process is a sophisticated ETL (Extract, Transform, Load) pipeline that runs
automatically on startup:

**Extract Phase** (`createKnowledgeBase`):
```javascript
// 1. Process JSDoc API data
const apiData = await fs.readJson('docs/output/all.json');
apiData.forEach(item => {
    if (item.kind === 'class') {
        chunk = {
            type: 'src',
            kind: 'class',
            name: item.longname,
            description: item.comment,
            extends: item.augments?.[0],
            source: sourceFile
        };
    }
    // ... methods, configs, etc.
});

// 2. Process Markdown learning content
const learnTree = await fs.readJson('learn/tree.json');
// ... parse and chunk markdown files

// 3. Process Release Notes
// 4. Process Ticket Archives
```

**Transform Phase** (in-memory enrichment):
```javascript
// Build inheritance chains for every chunk
const classNameToDataMap = {};
knowledgeBase.forEach(chunk => {
    if (chunk.kind === 'class') {
        classNameToDataMap[chunk.name] = { 
            source: chunk.source, 
            parent: chunk.extends 
        };
    }
});

knowledgeBase.forEach(chunk => {
    const inheritanceChain = [];
    let currentClass = chunk.className;
    
    while (currentClass && classNameToDataMap[currentClass]?.parent) {
        const parentClassName = classNameToDataMap[currentClass].parent;
        inheritanceChain.push({ 
            className: parentClassName, 
            source: classNameToDataMap[parentClassName].source 
        });
        currentClass = parentClassName;
    }
    
    chunk.inheritanceChain = inheritanceChain;
});
```

**Load Phase** (`embedKnowledgeBase`):
```javascript
// Smart diffing - only embed what changed
const existingDocsMap = new Map();
existingDocs.ids.forEach((id, index) => {
    existingDocsMap.set(id, existingDocs.metadatas[index].hash);
});

const chunksToProcess = [];
knowledgeBase.forEach((chunk, index) => {
    const chunkId = `id_${index}`;
    if (!existingDocsMap.has(chunkId) || 
        existingDocsMap.get(chunkId) !== chunk.hash) {
        chunksToProcess.push({ ...chunk, id: chunkId });
    }
});

// Batch embedding with retry logic
for (let i = 0; i < chunksToProcess.length; i += batchSize) {
    const batch = chunksToProcess.slice(i, i + batchSize);
    const result = await model.batchEmbedContents({
        requests: batch.map(chunk => ({
            model: aiConfig.embeddingModel,
            content: { parts: [{ text: `${chunk.type}: ${chunk.name}...` }] }
        }))
    });
    
    await collection.upsert({
        ids: batch.map(chunk => chunk.id),
        embeddings: result.embeddings.map(e => e.values),
        metadatas: batch.map(toMetadata)
    });
}
```

This design is intentionally memory-intensive at sync time to make queries lightning-fast. By pre-calculating inheritance
chains and content hashes during the load phase, we avoid expensive computations during every query.

### The Memory Core: An Agent's Personal History

If the Knowledge Base is the AI's understanding of the *project*, the **Memory Core** is its understanding of *itself*.
It's the agent's personal, persistent memory, transforming it from a stateless tool into a true collaborator that learns from experience.

Every interaction—every prompt, thought process, and response—is captured and stored as a "memory." This is not just a
chat log; it's a structured, queryable history of the agent's own work. When a new session begins, the Memory Core
automatically analyzes and summarizes all previous, unsummarized sessions. This creates a high-level "recap" of past work,
allowing the agent to remember what it did, what decisions it made, and why.

#### The Save-Then-Respond Protocol

At the heart of the Memory Core is the **transactional memory protocol**. Every agent interaction follows a strict
three-part structure defined in the OpenAPI spec:

```yaml
AddMemoryRequest:
  type: object
  required:
    - prompt
    - thought
    - response
  properties:
    prompt:
      type: string
      description: The user's verbatim prompt to the agent
    thought:
      type: string
      description: The agent's internal reasoning process
    response:
      type: string
      description: The agent's final, user-facing response
    sessionId:
      type: string
      description: Session ID for grouping (auto-generated if not provided)
```

This isn't just logging—it's a **mandatory save-then-respond loop**. The agent protocol requires that before delivering
any response to the user, the agent must call `add_memory` with its complete reasoning chain. This creates an honest,
unfiltered record of the agent's thought process.

Here's how it works in `MemoryService.mjs`:

```javascript
async addMemory({ prompt, response, thought, sessionId }) {
    const collection   = await ChromaManager.getMemoryCollection();
    const combinedText = `User Prompt: ${prompt}\nAgent Thought: ${thought}\nAgent Response: ${response}`;
    const timestamp    = new Date().toISOString();
    const memoryId     = `mem_${timestamp}`;
    
    // Generate semantic embedding for the entire interaction
    const embedding = await TextEmbeddingService.embedText(combinedText);
    
    await collection.add({
        ids: [memoryId],
        embeddings: [embedding],
        metadatas: [{
            prompt,
            response,
            thought,
            sessionId,
            timestamp,
            type: 'agent-interaction'
        }],
        documents: [combinedText]
    });
    
    return { id: memoryId, sessionId, timestamp, message: "Memory successfully added" };
}
```

The key innovation here is that we embed the **entire interaction**—prompt, thought, and response—as a single vector.
This means when the agent searches its memory later, it's searching not just for what it said, but for *why* it said it
and what problem it was solving.

#### Autonomous Session Summarization

The real magic happens at startup. Just like the Knowledge Base server, the Memory Core is **self-maintaining**.
When the server starts, it automatically discovers and summarizes any unsummarized sessions from previous work.

From `SessionService.mjs`:

```javascript
async initAsync() {
    await super.initAsync();
    await DatabaseLifecycleService.ready();
    
    // Initialize collections
    this.memoryCollection   = await ChromaManager.getMemoryCollection();
    this.sessionsCollection = await ChromaManager.getSummaryCollection();
    
    // Skip if GEMINI_API_KEY is missing
    if (!this.model) return;
    
    logger.info('[Startup] Checking for unsummarized sessions...');
    
    try {
        const result = await this.summarizeSessions({});
        
        if (result.processed > 0) {
            logger.info(`✅ [Startup] Summarized ${result.processed} session(s):`);
            result.sessions.forEach(session => {
                logger.info(`   - ${session.title} (${session.memoryCount} memories)`);
            });
        }
    } catch (error) {
        logger.warn('⚠️  [Startup] Session summarization failed:', error.message);
    }
}
```

The summarization process, orchestrated by `summarizeSessions`, uses **Gemini 2.5 Flash** to analyze the entire session
and extract structured metadata:

```javascript
async summarizeSession(sessionId) {
    const memories = await this.memoryCollection.get({
        where: {sessionId},
        include: ['documents', 'metadatas']
    });
    
    if (memories.ids.length === 0) return null;
    
    // Aggregate all memories from the session
    const aggregatedContent = memories.documents.join('\n\n---\n\n');
    
    const summaryPrompt = `
Analyze the following development session and provide a structured summary in JSON format:

- "summary": A detailed summary of the session
- "title": A concise, descriptive title (max 10 words)
- "category": One of: 'bugfix', 'feature', 'refactoring', 'documentation', 'new-app', 'analysis', 'other'
- "quality": Score 0-100 rating the session's flow and focus
- "productivity": Score 0-100 indicating if primary goals were achieved
- "impact": Score 0-100 estimating the significance of changes
- "complexity": Score 0-100 rating the task's complexity
- "technologies": Array of key technologies involved

${aggregatedContent}
`;
    
    const result = await this.model.generateContent(summaryPrompt);
    const summaryData = JSON.parse(result.response.text());
    
    // Embed the summary for semantic search
    const embeddingResult = await this.embeddingModel.embedContent(summaryData.summary);
    
    await this.sessionsCollection.upsert({
        ids: [`summary_${sessionId}`],
        embeddings: [embeddingResult.embedding.values],
        metadatas: [{
            sessionId,
            timestamp: new Date().toISOString(),
            memoryCount: memories.ids.length,
            ...summaryData
        }],
        documents: [summaryData.summary]
    });
    
    return { sessionId, title: summaryData.title, memoryCount: memories.ids.length };
}
```

#### The Two-Stage Query Protocol

The Memory Core implements a sophisticated **two-stage query strategy** for recalling past work:

**Stage 1: Query Summaries** (Fast)
When you need high-level context about past work, query the summary collection first:

```javascript
async querySummaries({ query, nResults, category }) {
    const collection = await ChromaManager.getSummaryCollection();
    const embedding  = await TextEmbeddingService.embedText(query);
    
    const queryArgs = {
        queryEmbeddings: [embedding],
        nResults,
        include: ['metadatas', 'documents']
    };
    
    if (category) {
        queryArgs.where = { category };
    }
    
    const searchResult = await collection.query(queryArgs);
    
    // Calculate relevance scores from vector distances
    const summaries = ids.map((id, index) => {
        const distance = Number(distances[index] ?? 0);
        const relevanceScore = Number((1 / (1 + distance)).toFixed(6));
        
        return {
            id,
            sessionId: metadata.sessionId,
            title: metadata.title,
            summary: documents[index],
            category: metadata.category,
            quality: Number(metadata.quality),
            productivity: Number(metadata.productivity),
            impact: Number(metadata.impact),
            complexity: Number(metadata.complexity),
            technologies: metadata.technologies.split(','),
            distance,
            relevanceScore
        };
    });
    
    return { query, count: summaries.length, results: summaries };
}
```

**Stage 2: Query Raw Memories** (Deep)
Once you've identified relevant sessions, drill down into the raw interaction data:

```javascript
async queryMemories({ query, nResults, sessionId }) {
    const collection = await ChromaManager.getMemoryCollection();
    const embedding  = await TextEmbeddingService.embedText(query);
    
    const queryArgs = {
        queryEmbeddings: [embedding],
        nResults,
        include: ['metadatas']
    };
    
    // Optional: Filter to specific session
    if (sessionId) {
        queryArgs.where = { sessionId };
    }
    
    const searchResult = await collection.query(queryArgs);
    
    return {
        query,
        count: memories.length,
        results: memories.map((memory, index) => ({
            ...memory,
            distance: distances[index],
            relevanceScore: 1 / (1 + distances[index])
        }))
    };
}
```

This two-stage approach is powerful because:
1. **Summaries are fast** - Pre-processed, high-level overviews for quick context
2. **Memories are detailed** - Full reasoning chains for deep investigation
3. **Categories enable filtering** - Find all "refactoring" or "bugfix" sessions instantly
4. **Quality metrics enable sorting** - Prioritize high-productivity sessions

#### Structured Session Metadata

The quality metrics generated by the summarization process provide valuable insights:

```json
{
    "quality": 85,         // Was the session focused and productive?
    "productivity": 90,    // Were the goals achieved?
    "impact": 75,          // How significant were the changes?
    "complexity": 60,      // How difficult was the task?
    "category": "feature", // What type of work was this?
    "technologies": ["neo.mjs", "chromadb", "nodejs"]
}
```

These aren't just numbers—they enable **performance analysis over time**. The agent (and we) can ask:
- "Show me all high-complexity sessions where productivity was low" (areas for improvement)
- "What features did I build with impact > 80?" (highlight reel)
- "Which refactoring sessions had quality < 50?" (sessions that went off-track)

This capability is critical for several reasons:

1.  **Learning & Self-Correction:** By querying its own history, the agent can identify patterns in its work, recall
    past solutions to similar problems, and avoid repeating mistakes. It can ask itself, "How did I solve that bug last week?"
    and get a concrete answer from its own experience.
2.  **Contextual Continuity:** An agent with memory can maintain context across days or even weeks. It can pick up a complex
    refactoring task exactly where it left off, without needing to be re-briefed on the entire history.
3.  **Performance Analysis:** The session summaries include metrics on quality, productivity, and complexity. This allows
    us (and the agent itself) to analyze its performance over time, identifying areas for improvement in its own
    problem-solving strategies.
4.  **Transactional Integrity:** The protocol for saving memories is transactional and mandatory. The agent *must* save
    a consolidated record of its entire turn (prompt, thought, response) before delivering its final answer.
    This "save-then-respond" loop, enforced by the `add_memory` tool, guarantees that no experience is ever lost,
    creating a rich and honest record of the entire problem-solving process.

The Memory Core is the foundation for an agent that doesn't just execute tasks, but grows, learns, and improves with every
interaction. It's the key to building a partner that truly understands the long-term narrative of the project.

## The GitHub Workflow Server: Closing the Loop

While the Knowledge Base provides context and the Memory Core provides continuity, the **GitHub Workflow Server** closes the loop by giving agents the ability to *participate directly* in the development workflow itself.

This server is where context engineering meets project management. It transforms GitHub issues and pull requests from remote API endpoints into **local, queryable, version-controlled markdown files** that are part of the knowledge base. Agents can search, read, and modify them just like source code—no API rate limits, no network latency, and complete offline capability.

### The Problem: The Human Review Bottleneck

During the middle of our 6-week sprint to resolve 388 tickets, Hacktoberfest 2025 created an unexpected bottleneck: **me**.

The event brought an incredible wave of community energy—over 52 pull requests from 20+ contributors in just a few weeks. Most contributors tried out the new AI-native workflows, which was fantastic for productivity but created a new challenge: **PRs with hundreds of lines of code** that all needed human review.

**Before the GitHub Workflow Server**, the workflow was entirely manual:

1. Contributor opens PR (often 100+ lines of AI-generated code)
2. **I** manually read through the entire diff on GitHub
3. **I** manually check related tickets for context
4. **I** manually write review comments
5. Contributor addresses feedback
6. Repeat until **I** approve and merge

With 52 PRs averaging hundreds of lines each, this became unsustainable. I was spending entire days just reviewing code.

**After creating the GitHub Workflow Server**, the workflow transformed:

1. Contributor opens PR
2. **I** tell the agent: "Please review PR #7730"
3. Agent uses MCP tools to:
    - Get the PR conversation (`get_conversation`)
    - Get the full diff (`get_pull_request_diff`)
    - Read the related ticket (if mentioned in conversation, or I provide the ID)
4. Agent analyzes everything and writes a review comment
5. **Before posting**, agent shows me the comment content (OpenAPI tool description mandates this)
6. I review the comment, maybe refine it with follow-up prompts
7. Agent posts the comment to GitHub (`create_comment`)

This dramatically reduced my workload. Instead of reading 100+ line diffs and writing detailed reviews myself, I could delegate the analysis to the agent and just review (and potentially refine) its findings before they were posted to GitHub.

But we needed this to work *without* becoming dependent on GitHub's API rate limits or network availability. The solution needed to be **local-first**.

### Local-First: Issues and PRs as Markdown Files

The GitHub Workflow Server implements a **bi-directional synchronization system** that represents issues and pull requests as local markdown files with YAML frontmatter:

```
.github/ISSUE/
├── issue-7711.md    # Active issues in main directory
├── issue-7712.md    # Also: closed issues from AFTER the latest release
└── ...

.github/ISSUE_ARCHIVE/
├── v11.0.0/
│   ├── issue-6840.md    # Closed issues archived by release
│   ├── issue-6901.md
│   └── ...
├── v10.9.0/
│   └── ...
└── unversioned/
    └── ...              # Closed issues from BEFORE syncStartDate with no milestone

.github/RELEASE_NOTES/
├── v11.0.0.md
├── v10.9.0.md
└── ...
```

**Example: `issue-7711.md` structure:**

```yaml
---
id: 7711
title: Fix VDOM Lifecycle and Update Collision Logic
state: CLOSED
labels: [bug, ai]
assignees: [tobiu]
createdAt: '2025-11-06T13:46:59Z'
updatedAt: '2025-11-06T13:55:25Z'
closedAt: '2025-11-06T13:55:25Z'
githubUrl: https://github.com/neomjs/neo/issues/7711
author: gemini-agent
commentsCount: 3
parentIssue: null
subIssues: []
milestone: 'v11.0.0'
---
# Fix VDOM Lifecycle and Update Collision Logic

**Reported by:** @gemini-agent on 2025-11-06

The current VDOM update logic has a race condition when...

## Comments

### @tobiu - 2025-11-06 14:23

Good catch! I think we should also consider...

### @gemini-agent - 2025-11-06 14:45

Agreed. I've updated the fix to handle that case...
```

This representation gives us several critical capabilities:

**For Agents:**
```javascript
// Semantic search over tickets (part of knowledge base)
query_documents({ 
  query: "VDOM lifecycle collision bugs",
  type: "ticket"  
})
// Returns relevant issues instantly
// No API rate limits, no network required
```

**For Maintainers:**
- **Platform independence**: Migrate from GitHub without losing history
- **Version control**: Ticket changes tracked in git history
- **Offline access**: Full project context always available
- **No vendor lock-in**: If GitHub changes, workflow continues

The bi-directional sync with GitHub is a *convenience*, not a dependency.

### The Self-Organizing Archive System

One of the most elegant features of the GitHub Workflow Server is its **automatic issue archiving system**. This solves a common problem in long-lived projects: how do you organize thousands of closed issues without manual categorization?

The system uses a simple but powerful rule set, implemented in `IssueSyncer.#getIssuePath()`:

**Rule 1: OPEN issues stay in the active directory**
```javascript
if (issue.state === 'OPEN') {
    return path.join(issueSyncConfig.issuesDir, filename);
}
```

**Rule 2: Dropped issues (wontfix, duplicate) are deleted**
```javascript
const isDropped = issueSyncConfig.droppedLabels.some(label => 
    labels.includes(label)
);
if (isDropped) {
    return null; // Not stored locally
}
```

**Rule 3: CLOSED issues with milestones → archive under that version**
```javascript
if (issue.state === 'CLOSED' && issue.milestone?.title) {
    return path.join(
        issueSyncConfig.archiveDir, 
        issue.milestone.title, 
        filename
    );
}
```

**Rule 4: CLOSED issues without milestones → find the first release published AFTER the close date**
```javascript
const closed = new Date(issue.closedAt);
const release = (ReleaseSyncer.sortedReleases || []).find(
    r => new Date(r.publishedAt) > closed
);

if (release) {
    return path.join(
        issueSyncConfig.archiveDir, 
        release.tagName, 
        filename
    );
}
```

**Rule 5: Issues closed AFTER the latest release → stay in active directory**
```javascript
// If no subsequent release is found, the issue was closed after the latest release
// and remains in the main directory until the next release is published
return path.join(issueSyncConfig.issuesDir, filename);
```

This creates a **self-organizing archive** that mirrors your actual release history. The active `ISSUE` directory contains:
- All OPEN issues
- All issues closed AFTER the most recent release

When you ship v11.0.0, all issues closed between v10.9.0 and v11.0.0 automatically move into the `v11.0.0` archive directory.
No manual organization required.

#### Handling the Edge Case: Reconciliation

There's a subtle edge case this system addresses brilliantly:
**What happens when you create a new release, but issues weren't updated?**

Because the sync uses delta updates (`since: lastSync`), if an issue was closed weeks ago and hasn't been modified since,
the pull operation won't fetch it. But now there's a *new* release, which means that issue *should* be archived under that release.

The `reconcileClosedIssueLocations()` method handles this:

```javascript
async reconcileClosedIssueLocations(metadata) {
    logger.info('📄 Reconciling closed issue locations...');
    
    const stats = { count: 0, issues: [] };
    
    for (const issueNumber in metadata.issues) {
        const issueData = metadata.issues[issueNumber];
        
        // CRITICAL: Only process issues in the active directory
        if (!issueData.path.startsWith(issueSyncConfig.issuesDir)) {
            continue; // Already archived, skip it
        }
        
        // Only process CLOSED issues
        if (issueData.state !== 'CLOSED') {
            continue;
        }
        
        // Calculate where this closed issue SHOULD be
        const correctPath = this.#getIssuePath({
            number   : parseInt(issueNumber),
            state    : issueData.state,
            milestone: issueData.milestone ? { title: issueData.milestone } : null,
            closedAt : issueData.closedAt,
            updatedAt: issueData.updatedAt
        });
        
        // Move if necessary
        if (issueData.path !== correctPath && 
            correctPath.includes(issueSyncConfig.archiveDir)) {
            
            await fs.mkdir(path.dirname(correctPath), { recursive: true });
            await fs.rename(issueData.path, correctPath);
            
            metadata.issues[issueNumber].path = correctPath;
            stats.count++;
            
            logger.info(`✅ Archived #${issueNumber} to ${path.relative(process.cwd(), correctPath)}`);
        }
    }
    
    return stats;
}
```

This reconciliation runs *before* the pull operation in the sync workflow, ensuring that when
`ReleaseSyncer.fetchAndCacheReleases()` updates the release list, any closed issues in the active directory get moved to
their proper archive locations.

### The Sync Engine: A Three-Phase ETL Pipeline

The synchronization process is orchestrated by `SyncService.runFullSync()`, which executes a carefully ordered sequence
of operations:

```javascript
async runFullSync() {
    const metadata = await MetadataManager.load();
    
    // 1. Fetch releases first (needed for issue archiving)
    await ReleaseSyncer.fetchAndCacheReleases(metadata);
    
    // 2. Reconcile closed issue locations
    const reconcileStats = await IssueSyncer.reconcileClosedIssueLocations(metadata);
    
    // 3. Push local changes to GitHub
    const pushStats = await IssueSyncer.pushToGitHub(metadata);
    
    // 4. Pull remote changes from GitHub
    const { newMetadata, stats: pullStats } = await IssueSyncer.pullFromGitHub(metadata);
    
    // 5. Sync release notes
    const releaseStats = await ReleaseSyncer.syncNotes(metadata);
    
    // 6. Self-heal push failures
    if (newMetadata.pushFailures?.length > 0) {
        newMetadata.pushFailures = newMetadata.pushFailures.filter(
            failedId => !newMetadata.issues[failedId]
        );
    }
    
    // 7. Save metadata
    await MetadataManager.save(newMetadata);
    
    return { success: true, statistics: finalStats, timing };
}
```

This ordering is critical:

1. **Releases first** - The archive system depends on knowing release dates
2. **Reconcile** - Move stale closed issues before pulling new changes
3. **Push then Pull** - Local changes go up before remote changes come down (prevents conflicts)
4. **Release notes last** - These are read-only and can't conflict
5. **Self-heal** - If a previously failed push was successfully pulled, remove it from the failure list

#### Smart Content Hashing for Change Detection

A key optimization in the push phase is **content hash comparison**. Without this, every sync would trigger unnecessary
GitHub API calls for issues that haven't actually changed.

Here's how it works in `IssueSyncer.pushToGitHub()`:

```javascript
// Calculate current content hash
const currentHash = this.#calculateContentHash(content);
const oldIssue    = metadata.issues[issueNumber];

// Compare content hash - skip if unchanged
if (oldIssue.contentHash && oldIssue.contentHash === currentHash) {
    logger.debug(`No content change for #${issueNumber}, skipping`);
    continue;
}

logger.info(`📝 Content changed for #${issueNumber}`);

// Step 1: Get the issue's GraphQL ID
const idData = await GraphqlService.query(GET_ISSUE_ID, {
    owner : aiConfig.owner,
    repo  : aiConfig.repo,
    number: issueNumber
});

const issueId = idData.repository.issue.id;

// Step 2: Prepare the updated content
const bodyWithoutComments = parsed.content.split(commentSectionDelimiter)[0].trim();
const titleMatch          = bodyWithoutComments.match(/^#\s+(.+)$/m);
const title               = titleMatch ? titleMatch[1] : parsed.data.title;

const cleanBody = bodyWithoutComments
    .replace(/^#\s+.+$/m, '')
    .replace(/^\*\*Reported by:\*\*.+$/m, '')
    .replace(/^---\n\n[\s\S]*?^---\n\n/m, '') // Remove relationship section
    .trim();

// Step 3: Execute the mutation
await GraphqlService.query(UPDATE_ISSUE, {
    issueId,
    title,
    body: cleanBody
});
```

The same hashing approach is used in `ReleaseSyncer.syncNotes()` to avoid rewriting release note files that haven't
changed on GitHub.

#### The GraphQL Optimization: One Query for Everything

Traditional REST APIs suffer from the **N+1 query problem**: fetch issues, then make N additional requests to get
comments for each issue. With 388 issues, that's 389 API calls.

The GitHub Workflow Server solves this with a single, optimized GraphQL query in `FETCH_ISSUES_FOR_SYNC`:

```javascript
export const FETCH_ISSUES_FOR_SYNC = `
  query FetchIssuesForSync(
    $owner: String!
    $repo: String!
    $limit: Int!
    $cursor: String
    $states: [IssueState!]
    $since: DateTime
    $maxLabels: Int!
    $maxAssignees: Int!
    $maxComments: Int!
    $maxSubIssues: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      issues(
        first: $limit
        after: $cursor
        states: $states
        orderBy: {field: UPDATED_AT, direction: DESC}
        filterBy: {since: $since}
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          number
          title
          body
          state
          createdAt
          updatedAt
          closedAt
          url
          
          author {
            login
          }
          
          labels(first: $maxLabels) {
            nodes {
              name
            }
          }
          
          assignees(first: $maxAssignees) {
            nodes {
              login
            }
          }
          
          milestone {
            title
          }
          
          comments(first: $maxComments) {
            nodes {
              author {
                login
              }
              body
              createdAt
            }
          }
          
          # Parent/child relationships
          parent {
            number
            title
          }
          
          subIssues(first: $maxSubIssues) {
            nodes {
              number
              title
              state
            }
          }
          
          subIssuesSummary {
            total
            completed
            percentCompleted
          }
        }
      }
    }
    
    # Monitor rate limit usage
    rateLimit {
      cost
      remaining
      resetAt
    }
  }
`;
```

This single query returns:
- Issue metadata
- All labels
- All assignees
- **All comments** (the critical piece)
- Sub-issues and progress tracking
- Parent issue relationships
- Rate limit status

The `IssueSyncer.pullFromGitHub()` method processes all of this in one pass:

```javascript
// Process each issue
for (const issue of allIssues) {
    const issueNumber = issue.number;
    const targetPath  = this.#getIssuePath(issue);
    
    // Comments are already in issue.comments - no separate fetch needed!
    const markdown = this.#formatIssueMarkdown(issue, issue.comments.nodes);
    const contentHash = this.#calculateContentHash(markdown);
    
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, markdown, 'utf-8');
    
    newMetadata.issues[issueNumber] = {
        state    : issue.state,
        path     : targetPath,
        updatedAt: issue.updatedAt,
        closedAt : issue.closedAt || null,
        milestone: issue.milestone?.title || null,
        title    : issue.title,
        contentHash // Store for next sync
    };
}
```

For 388 issues, this is **one paginated query** (with 4-5 pages) instead of 389 separate requests. The cost? About 150 GraphQL points vs. 388+ REST API calls.

### Autonomous PR Review: Removing the Human Bottleneck

With issues now queryable and modifiable locally, the final piece was enabling agents to participate in the pull request workflow. The `PullRequestService` provides the tools agents need:

#### 1. Discovery: Finding PRs That Need Review

```javascript
async listPullRequests(options = {}) {
    const {limit = 30, state = 'open'} = options;
    
    const variables = {
        owner : aiConfig.owner,
        repo  : aiConfig.repo,
        limit,
        states: state.toUpperCase()
    };
    
    const data = await GraphqlService.query(FETCH_PULL_REQUESTS, variables);
    return {
        count: data.repository.pullRequests.nodes.length,
        pullRequests: data.repository.pullRequests.nodes
    };
}
```

An agent can now run `list_pull_requests({state: 'open'})` and see all open PRs with their titles, authors, and status.

#### 2. Analysis: Getting the Full Context

```javascript
async getPullRequestDiff(prNumber) {
    const {stdout} = await execAsync(`gh pr diff ${prNumber}`);
    return { result: stdout };
}

async getConversation(prNumber) {
    const variables = {
        owner      : aiConfig.owner,
        repo       : aiConfig.repo,
        prNumber,
        maxComments: 100
    };
    
    const data = await GraphqlService.query(GET_CONVERSATION, variables);
    return data.repository.pullRequest;
}
```

With these two tools, an agent can:
1. **Get the diff** - See exactly what code changed
2. **Get the conversation** - Read the PR description, all comments, and review history

This gives the agent **complete context** for making informed review decisions.

#### 3. Participation: Leaving Structured Feedback

```javascript
async createComment(prNumber, body, agent) {
    const header       = `**Input from ${agent}:**\n\n`;
    const agentIcon    = AGENT_ICONS[this.getAgentType(agent)];
    const headingMatch = body.match(/^(#+\s*)(.*)$/);
    let processedBody;
    
    if (headingMatch) {
        const headingMarkers = headingMatch[1];
        const headingContent = headingMatch[2];
        processedBody = `${headingMarkers}${agentIcon} ${headingContent}\n${body.substring(headingMatch[0].length)}`;
    } else {
        processedBody = `${agentIcon} ${body}`;
    }
    
    const finalBody = `${header}${processedBody.split('\n').map(line => `> ${line}`).join('\n')}`;
    
    const idData    = await GraphqlService.query(GET_PULL_REQUEST_ID, {owner, repo, prNumber});
    const subjectId = idData.repository.pullRequest.id;
    
    await GraphqlService.query(ADD_COMMENT, { subjectId, body: finalBody });
    return { message: `Successfully created comment on PR #${prNumber}` };
}
```

This method does something clever: it **attributes the comment to the agent** with:
- A clear header: `**Input from Gemini 2.5 Pro:**`
- An agent-specific icon: ✦ (Gemini), ◊ (Claude), ◯ (GPT)
- Blockquote formatting for the entire comment

The result looks like this on GitHub:

> **Input from Gemini 2.5 Pro:**
>
> ### ✦ Code Review Findings
>
> I've analyzed the changes in this PR and found the following:
>
> 1. **Line 47**: The null check should be moved before the dereference
> 2. **Line 89**: Consider using the existing `validateInput()` helper
> 3. **Tests**: The edge case for empty arrays is not covered

This clear attribution ensures:
- **Transparency** - Everyone knows this is AI input, not a human reviewer
- **Accountability** - The specific agent (and its version) is recorded
- **Context** - Future agents can query their own review history via the Memory Core

### 4. Local Testing: Checking Out PRs

```javascript
async checkoutPullRequest(prNumber) {
    const {stdout} = await execAsync(`gh pr checkout ${prNumber}`);
    return {
        message: `Successfully checked out PR #${prNumber}`, 
        details: stdout.trim()
    };
}
```

For deeper analysis, an agent can **check out the PR branch locally**, run the test suite, and verify the changes work as expected before leaving a review.

### The Complete Review Workflow

With these tools, the autonomous PR review workflow becomes:

```
1. Agent: list_pull_requests({state: 'open'})
   → Discovers PR #1234 needs review

2. Agent: get_conversation(1234)
   → Reads PR description and existing comments

3. Agent: get_pull_request_diff(1234)
   → Analyzes the code changes

4. Agent: checkout_pull_request(1234)
   → Checks out the branch locally

5. Agent: Run npm test
   → Verifies tests pass

6. Agent: create_comment(1234, reviewText, 'Gemini 2.5 Pro')
   → Leaves structured review feedback

7. Agent: add_memory({
     prompt: "Review PR #1234",
     thought: "Analyzed the changes, found 2 issues...",
     response: "Left review comment on PR #1234"
   })
   → Records the review in Memory Core for future reference
```

This workflow removed **me** as the bottleneck. For the 52 Hacktoberfest PRs, agents could:
- Identify common issues (missing tests, style violations)
- Request changes or suggest improvements
- Approve simple PRs (documentation, typo fixes)
- Escalate complex PRs that needed deeper architectural review

I went from **reviewing every PR** to **reviewing only the escalated ones**. The agents handled the routine review work,
and I focused on the decisions that truly needed human judgment.

## Platform Independence and the Future

The GitHub Workflow Server's local-first architecture isn't just about performance—it's about **platform independence**.

Every issue and every release note is stored as a markdown file in your repository.
If GitHub is acquired by a company whose AI policies conflict with your project's goals
(it actually got bought by MicroSoft), or if API pricing changes make it untenable, you simply:

1. **Keep working** - The local files are your source of truth
2. **Switch platforms** - Port the sync logic to GitLab, Gitea, or any other platform
3. **No data loss** - Your entire issue history is in git

This is the same philosophy that drives the Knowledge Base server: **make the AI's workspace platform-agnostic and version-controlled**.

The sync with GitHub is a convenience, not a dependency. If GitHub disappeared tomorrow, your agents would still have:
- Full issue history
- Complete PR conversations
- Semantic search over all tickets
- The ability to create and modify issues locally

You'd just need to build a different sync adapter when you were ready to push to a new platform.

## What We've Built

The GitHub Workflow Server demonstrates that **context engineering extends beyond code**. Issues, PRs, and project
management artifacts are *part of the context* an AI needs to be truly productive.

By representing them as local markdown files that are:
- **Queryable** via semantic search
- **Modifiable** via standard file operations
- **Synchronized** bi-directionally with GitHub
- **Version controlled** in git
- **Platform independent** by design

We've created a system where agents can:
- Find relevant historical issues when solving bugs
- Review PRs autonomously with full context
- Participate in project discussions
- Learn from their own review history across sessions

This is what it means to build an **AI-native, not AI-assisted** platform. The AI isn't just a tool you use—it's a
**first-class participant in your development workflow**.

And the results speak for themselves: 388 tickets, 52 PRs, zero manual archive organization, and a development velocity
that should be impossible for a one-person core team.

## The Neo.mjs Backbone: Powering Our Servers

All three MCP servers are built using the **official MCP SDK** for protocol compliance,
but their internal architecture is pure **Neo.mjs**. This isn't just a case of "dogfooding"—using our own framework for the backend provided critical advantages in building a robust, asynchronous, and maintainable server architecture. For example, every service inside the servers—like `QueryService` in the Knowledge Base or `SessionService` in the Memory Core—is a Neo.mjs singleton that extends `Neo.core.Base`.

This demonstrates a key design principle: **Neo.mjs isn't just for browsers**. The same class system that powers complex
frontend applications also provides robust infrastructure for backend services.

##### The Power of initAsync() and ready()

One of the most elegant aspects of Neo.mjs for backend development is its **asynchronous initialization system**.
Every `Neo.core.Base` instance has an `initAsync()` lifecycle hook and a `ready()` promise that resolves when
initialization is complete.

From `Neo.core.Base`:

```javascript
construct(config={}) {
    // ... initialization code ...
    
    // Storing a resolver to execute inside `afterSetIsReady`
    this.#readyPromise = new Promise(resolve => {
        this.#readyResolver = resolve
    });
    
    // Triggers async logic after the construction chain is done
    Promise.resolve().then(async () => {
        await this.initAsync();
        this.isReady = true
    })
}

/**
 * You can use this method in subclasses to perform asynchronous initialization logic.
 * Make sure to use the parent call `await super.initAsync()` at the beginning.
 * 
 * Once the promise returned by this method is fulfilled, the `isReady` config will be set to `true`.
 * @returns {Promise<void>}
 */
async initAsync() {
    this.remote && this.initRemote()
}

/**
 * Returns a promise that resolves when the instance is fully initialized.
 * @returns {Promise<void>}
 */
ready() {
    return this.#readyPromise;
}
```

This pattern enables **elegant dependency orchestration** throughout the server architecture. Here's how `SessionService` uses it:

```javascript
async initAsync() {
    await super.initAsync();
    
    // Wait for DatabaseLifecycleService to ensure ChromaDB is available
    await DatabaseLifecycleService.ready();
    
    // Use ChromaManager instead of direct client access
    this.memoryCollection   = await ChromaManager.getMemoryCollection();
    this.sessionsCollection = await ChromaManager.getSummaryCollection();
    
    // Skip if GEMINI_API_KEY is missing
    if (!this.model) return;
    
    logger.info('[Startup] Checking for unsummarized sessions...');
    
    const result = await this.summarizeSessions({});
    // ... process results ...
}
```

The beauty of this pattern is that **services can depend on each other** without complex coordination logic:

1. **`ChromaManager`** initializes and establishes the ChromaDB connection
2. **`DatabaseLifecycleService`** waits for `ChromaManager.ready()` and starts ChromaDB
3. **`SessionService`** waits for `DatabaseLifecycleService.ready()` and performs summarization
4. **`mcp-stdio.mjs`** waits for `SessionService.ready()` and starts the MCP server

All of this happens **automatically and in the correct order**, with zero race conditions. From the main entry point:

```javascript
async function main() {
    // Wait for async services to initialize.
    // SessionService.ready() will internally wait for the DB and summarize sessions.
    await SessionService.ready();
    
    // Perform initial health check
    const health = await HealthService.healthcheck();
    
    // Report status and start server
    // ...
}
```

##### Singleton Pattern and Service Architecture

All services use the Neo.mjs **singleton pattern**, which combines class-level state management with instance lifecycle:

```javascript
class SessionService extends Base {
    static config = {
        className: 'AI.mcp.server.memory-core.services.SessionService',
        singleton: true,
        // Reactive configs with lifecycle hooks
        model_: null,
        embeddingModel_: null
    }
    
    construct(config) {
        super.construct(config);
        
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            logger.warn('⚠️  GEMINI_API_KEY not set - skipping summarization');
            HealthService.recordStartupSummarization('skipped', { 
                reason: 'GEMINI_API_KEY not set' 
            });
            return;
        }
        
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        this.model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        this.embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    }
}

export default Neo.setupClass(SessionService);
```

The `singleton: true` config ensures:
- **Only one instance** exists throughout the application lifecycle
- **Global access** via the class itself (e.g., `SessionService.summarizeSessions()`)
- **Automatic registration** with the instance manager
- **Consistent state** across all parts of the application

##### Reactive Configuration System

Neo.mjs brings its powerful **reactive config system** to Node.js. The system is driven by `Neo.setupClass()`,
which processes every class definition and applies sophisticated configuration logic.

**Configs ending with an underscore (`_`) are reactive:**

```javascript
static config = {
    model_: null,
    embeddingModel_: null,
    memoryCollection_: null,
    sessionsCollection_: null
}
```

During `setupClass()`, Neo.mjs automatically:

1. **Removes the underscore** from the static config key
2. **Generates getter and setter** for the public property name
3. **Enables optional lifecycle hooks** (if you implement them):
    - `beforeGetModel(value)` - Modify value before returning from getter
    - `beforeSetModel(value, oldValue)` - Validate/transform before setting (return `undefined` to cancel)
    - `afterSetModel(value, oldValue)` - React to changes after they occur

Here's the actual logic from `Neo.setupClass()`:

```javascript
// Process each config property defined in the current class's static config
Object.entries(cfg).forEach(([key, value]) => {
    const
        isReactive = key.slice(-1) === '_',
        baseKey    = isReactive ? key.slice(0, -1) : key;
    
    // Handle reactive configs: Generate getters/setters
    if (isReactive) {
        delete cfg[key];      // Remove original key with underscore
        cfg[baseKey] = value; // Use base key without underscore
        Neo.createConfig(element, baseKey) // Generate getter/setter
    }
    // Non-reactive configs get set directly on prototype
    else if (!Neo.hasPropertySetter(element, key)) {
        Object.defineProperty(element, key, {
            enumerable: true, 
            value, 
            writable: true
        })
    }
});
```

**The key insight:** Subclasses can provide new default values without the underscore, and they'll still be reactive if
the parent defined them with an underscore. This enables clean configuration hierarchies:

```javascript
// Parent class
class ChromaManager extends Base {
    static config = {
        client_: null,           // Reactive in parent
        connected_: false,       // Reactive in parent
        memoryCollection_: null  // Reactive in parent
    }
}

// Child can override defaults without underscore
class ExtendedManager extends ChromaManager {
    static config = {
        connected: true  // Still reactive! Inherits from parent
    }
}
```

**Non-reactive configs** (without underscore) are applied directly to the class **prototype**, making them shared across
all instances. This is memory-efficient and enables the powerful `Neo.overwrites` mechanism for application-wide theming.

```javascript
#cachedHealth = null;
#lastCheckTime = null;
#cacheDuration = 5 * 60 * 1000;

async healthcheck() {
    const now = Date.now();
    
    // Smart caching: only cache healthy results
    if (this.#cachedHealth?.status === 'healthy' && this.#lastCheckTime) {
        const age = now - this.#lastCheckTime;
        if (age < this.#cacheDuration) {
            logger.debug(`[HealthService] Using cached health status (age: ${Math.round(age / 1000)}s)`);
            return this.#cachedHealth;
        }
    }
    
    // Perform fresh check
    const health = await this.#performHealthCheck();
    
    // Update cache
    this.#cachedHealth = health;
    this.#lastCheckTime = now;
    
    return health;
}
```

##### Observable Pattern for Cross-Service Communication

Services can use the **Observable mixin** for event-driven architecture:

```javascript
class DatabaseLifecycleService extends Base {
    static observable = true; // Enables event system
    
    async startDatabase() {
        // ... start ChromaDB ...
        
        this.fire('processActive', { 
            pid: this.chromaProcess.pid, 
            managedByService: true 
        });
    }
    
    async stopDatabase() {
        // ... stop ChromaDB ...
        
        this.fire('processStopped', { 
            pid, 
            managedByService: true 
        });
    }
}
```

Other services can listen to these events for coordination without tight coupling.

##### Why This Matters

The Neo.mjs class system brings several advantages to backend development:

1. **Zero Boilerplate** - No need for custom dependency injection frameworks
2. **Declarative Dependencies** - Services express their needs via `await ready()`
3. **Lifecycle Management** - `initAsync()`, `construct()`, `destroy()` provide clear hooks
4. **Type Safety** - Config validation happens automatically at runtime
5. **Memory Efficiency** - Singletons ensure one instance per service
6. **Debugging** - Clear initialization order, consistent patterns

This is the same class system that manages complex UI component hierarchies in the browser, now orchestrating ChromaDB
connections, Gemini API calls, and MCP server lifecycles in Node.js.


## The Benefits of a Server-Based Approach

This shift to a multi-server architecture brings a host of benefits:

-   **Robustness and Reliability:** Servers are more resilient than scripts, with better error handling and a more stable API.
-   **Agent-Agnosticism:** Any AI agent that can speak the MCP language can now connect to our development environment.
-   **Self-Hosting:** In a powerful demonstration of "dogfooding," the MCP servers themselves are built using the `Neo.mjs`
    class system. This showcases the framework's versatility for creating robust, scalable backend and CLI applications.
-   **Simplified Onboarding:** The servers now manage their own database startup and session summarization automatically.
    This drastically simplifies the agent onboarding process, reducing the agent's setup protocol by over 70%.
-   **Self-Documenting Tools:** The MCP tools are now self-documenting, allowing agents to dynamically inspect tool
    capabilities and schemas, making the entire system more resilient and easier to extend.

## Agent-Driven Quality: The Final Piece of the Puzzle

A self-aware development environment is only as good as the quality of the code it produces. To that end, we have
completed the migration of our entire unit test suite from the browser-based Siesta to the Node.js-based Playwright runner.

This is a game-changer. For the first time, AI agents can now run `npm test` to validate their own changes.
This is a critical step toward a fully autonomous, quality-driven development loop and a prerequisite for future CI/CD integration.

## A Community-Powered Revolution

This monumental release would not have been possible without the incredible energy and contributions from our community,
especially during **Hacktoberfest 2025**. We received over 52 pull requests from more than 20 contributors,
a new record for the project.

The event was also a crucial turning point. For years, the Neo.mjs project has had a "bus factor" of one: what happens if its creator, Tobi, stops working on it? Before the new AI-native tooling, the steep learning curve meant that very few external developers could make significant contributions.

Hacktoberfest 2025 shattered that limitation. For the first time, we saw a wave of meaningful contributions from developers who were new to the framework. By pairing up with AI agents using the new MCP servers, contributors could quickly get up to speed, understand complex parts of the codebase, and submit high-quality pull requests.

This was the breakthrough. It proved that context engineering isn't just a theoretical concept—it's a practical solution to the "bus factor" problem. Developers no longer need to spend months learning the framework's intricacies on their own. With an AI partner that has deep contextual knowledge, they can start making an impact in days or even hours.

Our heartfelt thanks go out to everyone who participated, not just for their code, but for helping us prove this vision:
Aki-07, Ayush Kumar, Chisaneme Aloni, Emmanuel Ferdman, Ewelina Bierć, KURO-1125, LemonDrop847, Mahita07, MannXo,
Mariam Saeed, Nallana Hari Krishna, Nitin Mishra, PrakhyaDas, Ritik Mehta, Sanjeev Kumar, Sarthak Jain, ad1tyayadav,
cb-nabeel, kart-u, nikeshadhikari9, srikanth-s2003.

<img width="941" height="560" alt="Screenshot 2025-10-27 at 15 14 32" src="https://github.com/user-attachments/assets/4d7d75d7-b2ff-4811-89f3-c167e620783d" />

## What's Next

The infrastructure we've built is a powerful foundation, but it's just the beginning.

### Future Enhancements

If there is community interest, we are considering several major enhancements:

- **Pull Request Synchronization:** While the GitHub Workflow server can already review PRs, the next logical step is to sync their conversations and diffs to local markdown files, just like issues. This would make PR history fully queryable and part of the permanent, offline knowledge base.
- **AI-Native Workspaces:** The ultimate goal is to bring this level of AI support to every Neo.mjs developer. We plan to integrate the MCP server setup directly into the `npx neo-app` command, allowing any generated workspace to become an AI-native environment out of the box.

### Standalone Server Releases?

The **Memory Core** and **GitHub Workflow** servers are framework-agnostic. They work with any software project, not just Neo.mjs.

**Question for the community:** Would standalone npm packages be useful for your projects?

If there's interest, we can release them as e.g.:
- `npx neo.mjs/memory-core-server`
- `npx neo.mjs/github-workflow-server`

**Let us know inside the comments or inside the Discord or Slack Channels.**

### Getting Started Today

Ready to explore the AI-native workflow?

- [Working with Agents](https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md) - General guidance
- [AI Quick Start](https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md) - First session checklist
- [Codebase Overview](https://github.com/neomjs/neo/blob/dev/learn/guides/fundamentals/CodebaseOverview.md) - What agents read at startup
- [MCP Server Source Code](https://github.com/neomjs/neo/tree/dev/ai/mcp/server) - The full source code for all three MCP servers.
- [Agent Protocol (AGENTS.md)](https://github.com/neomjs/neo/blob/dev/AGENTS.md) - The behavioral rules (inside the context window of each session)
- [Agent Startup (AGENTS_STARTUP.md)](https://github.com/neomjs/neo/blob/dev/AGENTS_STARTUP.md) - Session initialization

---

## The Future of Context Engineering

Neo.mjs v11 isn't just about new features—it's about a new way of thinking about software development.

We're building a development environment that is truly **AI-native**: self-aware, self-documenting, and self-improving.

This is **Context Engineering**—the art and science of building systems that understand their own context and use that
understanding to improve themselves.

We're at the beginning of this journey. The road ahead is long, but the destination is clear:
a future where humans and machines collaborate to build better, faster, and more maintainable software.

**Join us.** Fork the repository, explore the MCP servers, and start a conversation with our AI-native platform.

The future of development is here, and it's more intelligent than you might imagine.
