# 388 Tickets in 6 Weeks: Context Engineering Done Right

*From shell scripts to a multi-MCP-server JavaScript architecture, this article covers the journey with concepts,
code deep-dives, and examples.*

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/ContextEngineering.jpg" alt="Cover Image" class="blog-image">

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
- **Zero npm security warnings** (down from 13, including 7 high-severity)
- **`jsdoc-x` rewrite: 5.2s builds** (81% faster than the previous 28s)
- **30+ testing files** migrated to enable agent self-verification

For a core team that's primarily one person, this velocity should be impossible.

**It's not.** And it's reproducible.

This release proves that the right infrastructure—what we call **Context Engineering**—can make AI agents genuinely productive.
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

The Knowledge Base server is where we've pushed the boundaries of what's possible with MCP. Rather than hardcoding tool
definitions in JavaScript, we've built a system that's **entirely driven by OpenAPI 3 specifications**.

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

While the Knowledge Base provides context and the Memory Core provides continuity, the **GitHub Workflow Server** closes
the loop by giving the agent the ability to *act* on the development workflow itself.

This server provides:
- **Bi-directional sync** of GitHub issues and PRs as local markdown files
- **GraphQL API integration** for fast, reliable GitHub operations
- **Automated PR lifecycle management** from creation to merge
- **Local-first workflow** where agents work with files, not APIs

```
.github/ISSUES/
├── issue-7711.md    # Full ticket: YAML frontmatter + markdown
├── issue-7712.md
└── ...

.github/RELEASE_NOTES/
├── v11.0.0.md
├── v10.9.0.md
└── ...
```

**Example: issue-7711.md structure:**
```yaml
---
id: 7711
title: Fix VDOM Lifecycle and Update Collision Logic
state: CLOSED
labels: [bug, ai]
createdAt: '2025-11-06T13:46:59Z'
closedAt: '2025-11-06T13:55:25Z'
---
# Fix VDOM Lifecycle and Update Collision Logic

[Full markdown content...]
```

**Why this matters:**

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
- **No vendor lock-in**: If Microsoft/Azure forces changes, workflow continues

The bi-directional sync with GitHub is a *convenience*, not a dependency.

We'll dive deep into this server in a future section, but the key insight is that by representing GitHub issues as local
markdown files that are part of the knowledge base, we've made the entire project backlog *queryable* and *actionable* for AI agents.

## The Neo.mjs Backbone: Powering Our Servers

Like all three MCP servers, the Memory Core is built using the **official MCP SDK** for protocol compliance,
but its internal architecture is pure **Neo.mjs**. Every service—`MemoryService`, `SessionService`, `SummaryService`,
`HealthService`—is a Neo.mjs singleton that extends `Neo.core.Base`.

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

Our heartfelt thanks go out to:
Aki-07, Ayush Kumar, Chisaneme Aloni, Emmanuel Ferdman, Ewelina Bierć, KURO-1125, LemonDrop847, Mahita07, MannXo,
Mariam Saeed, Nallana Hari Krishna, Nitin Mishra, PrakhyaDas, Ritik Mehta, Sanjeev Kumar, Sarthak Jain, ad1tyayadav,
cb-nabeel, kart-u, nikeshadhikari9, srikanth-s2003.

<img width="941" height="560" alt="Screenshot 2025-10-27 at 15 14 32" src="https://github.com/user-attachments/assets/4d7d75d7-b2ff-4811-89f3-c167e620783d" />

## What's Next

### Standalone Server Releases?

The **Memory Core** and **GitHub Workflow** servers are framework-agnostic. They work with any JavaScript project, not just Neo.mjs.

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
