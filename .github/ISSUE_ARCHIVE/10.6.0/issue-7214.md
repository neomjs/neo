---
id: 7214
title: Local AI Knowledge Base Setup for the Neo.mjs Repository
state: CLOSED
labels:
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2025-09-18T16:06:18Z'
updatedAt: '2025-10-22T23:04:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7214'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-19T12:22:44Z'
---
# Local AI Knowledge Base Setup for the Neo.mjs Repository

**Reported by:** @tobiu on 2025-09-18

This document outlines how to set up a local, CLI-driven AI knowledge base within the `neo` repository. This system allows developers and AI agents to quickly find relevant source code and documentation for a given query.

The architecture is based on a local Retrieval-Augmented Generation (RAG) pattern:
1.  **Knowledge Extraction**: JSDoc comments and markdown learning guides are extracted into a structured JSON file.
2.  **Embedding**: The extracted knowledge is converted into vector embeddings and stored in a local ChromaDB database, managed by a local ChromaDB server.
3.  **CLI Querying**: An `npm` script provides a command-line interface to query the database, find the most relevant source files for a natural language query, and print the results.

## Step 1: Environment Configuration

The build scripts require access to your Google AI API key.

1.  **Create a `.env` file** in the root of the `neo` repository.
2.  **Add your API key** to the file:
    ```
    GEMINI_API_KEY="YOUR_API_KEY_HERE"
    ```
3.  **Add `.env` to your `.gitignore` file** to avoid committing your secret key.

## Step 3: Install and Run ChromaDB Server

The `chromadb-js` client requires a running ChromaDB server to connect to.

1.  **Install ChromaDB** using pip:
    ```bash
    pip install chromadb
    ```

2.  **Run the ChromaDB server**. In a separate terminal, run the following command from the root of the `neo` repository. This will start the server and tell it to persist data in the `chroma` directory.
    ```bash
    npm run ai:server
    ```
    Keep this terminal window open. The server must be running for the embedding and querying scripts to work.

---

## Step 4: Create the Build and Query Scripts

These scripts will process the source code, build the knowledge base, and query it. Create a new directory `buildScripts/ai/` in the `neo` repository and add the following three files.

**File 1: `buildScripts/ai/createKnowledgeBase.mjs`**

*This script reads JSDoc output and learning guides to create a unified `ai-knowledge-base.json` file.*

```javascript
// buildScripts/ai/createKnowledgeBase.mjs
import fs from 'fs-extra';
import path from 'path';

class CreateKnowledgeBase {
    static async run() {
        console.log('Starting knowledge base creation...');
        const chunks = [];

        // 1. Process the consolidated API/JSDoc file
        const apiPath = path.resolve(process.cwd(), 'docs/output/all.json');
        const apiData = await fs.readJson(apiPath);

        apiData.forEach(item => {
            const sourceFile = item.meta ? path.join(item.meta.path, item.meta.filename) : 'unknown';

            if (item.kind === 'class') {
                chunks.push({
                    type: 'class',
                    name: item.longname,
                    description: item.comment,
                    source: sourceFile
                });
            } else if (item.kind === 'member' && item.memberof) {
                chunks.push({
                    type: 'config',
                    className: item.memberof,
                    name: item.name,
                    description: item.description,
                    configType: item.type?.names.join('|') || 'unknown',
                    source: sourceFile
                });
            } else if (item.kind === 'function' && item.memberof) {
                chunks.push({
                    type: 'method',
                    className: item.memberof,
                    name: item.name,
                    description: item.description,
                    params: item.params?.map(p => ({ name: p.name, type: p.type?.names.join('|') })),
                    returns: item.returns?.map(r => r.type?.names.join('|')).join('|'),
                    source: sourceFile
                });
            }
        });
        console.log(`Processed ${chunks.length} API/JSDoc chunks.`);

        // 2. Process the learning content
        const learnTreePath = path.resolve(process.cwd(), 'learn/tree.json');
        const learnTree = await fs.readJson(learnTreePath);
        const learnBasePath = path.resolve(process.cwd(), 'learn');

        for (const item of learnTree.data) {
            if (item.id && !item.isLeaf) { // Assuming parent nodes are directories
                // We can add more granular processing here later if needed
            } else if (item.id) {
                const filePath = path.join(learnBasePath, `${item.id}.md`);
                if (await fs.pathExists(filePath)) {
                    const content = await fs.readFile(filePath, 'utf-8');
                    chunks.push({
                        type: 'guide',
                        name: item.name,
                        id: item.id,
                        content: content,
                        source: filePath
                    });
                }
            }
        }
        console.log(`Processed learning content. Total chunks: ${chunks.length}.`);

        // 3. Save the unified chunks
        const outputPath = path.resolve(process.cwd(), 'dist/ai-knowledge-base.json');
        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeJson(outputPath, chunks, { spaces: 2 });
        console.log(`Knowledge base creation complete. Saved to ${outputPath}`);
    }
}

CreateKnowledgeBase.run().catch(err => {
    console.error(err);
    process.exit(1);
});
```

**File 2: `buildScripts/ai/embedKnowledgeBase.mjs`**

*This script loads the generated JSON, creates vector embeddings, and stores them in a local ChromaDB instance.*

```javascript
// buildScripts/ai/embedKnowledgeBase.mjs
import { ChromaClient } from 'chromadb';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'path';

dotenv.config();

class EmbedKnowledgeBase {
    static async run() {
        console.log('Starting knowledge base embedding...');
        const projectRoot = process.cwd();

        const knowledgeBasePath = path.resolve(projectRoot, 'dist/ai-knowledge-base.json');
        if (!await fs.pathExists(knowledgeBasePath)) {
            throw new Error(`Knowledge base not found at ${knowledgeBasePath}. Please run createKnowledgeBase.mjs first.`);
        }
        const knowledgeBase = await fs.readJson(knowledgeBasePath);
        console.log(`Loaded ${knowledgeBase.length} knowledge chunks.`);

        const dbClient = new ChromaClient();
        const collectionName = 'neo_knowledge';

        try {
            await dbClient.deleteCollection({ name: collectionName });
            console.log(`Deleted existing collection: ${collectionName}`);
        } catch (err) { /* Collection probably didn't exist, which is fine */ }
        
        const embeddingFunction = {
            generate: (texts) => {
                // This will not be called because we provide embeddings directly.
                console.log('Dummy embedding function called. This should not happen.');
                return Promise.resolve(texts.map(() => []));
            }
        };

        const collection = await dbClient.createCollection({
            name: collectionName,
            embeddingFunction: embeddingFunction
        });
        console.log(`Created new collection: ${collectionName}`);

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');
        
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        console.log('Initialized Google AI embedding model: text-embedding-004.');

        console.log('Embedding chunks...');
        const batchSize = 100;
        const maxRetries = 5;

        for (let i = 0; i < knowledgeBase.length; i += batchSize) {
            const batch = knowledgeBase.slice(i, i + batchSize);
            const textsToEmbed = batch.map(chunk => `${chunk.type}: ${chunk.name} in ${chunk.className || ''}\n${chunk.description || ''}`);
            
            let retries = 0;
            let success = false;

            while (retries < maxRetries && !success) {
                try {
                    const result = await model.batchEmbedContents({
                        requests: textsToEmbed.map(text => ({ model: "text-embedding-004", content: { parts: [{ text }] } }))
                    });
                    const embeddings = result.embeddings.map(e => e.values);

                    const metadatas = batch.map(chunk => {
                        const metadata = {};
                        for (const [key, value] of Object.entries(chunk)) {
                            if (value === null) {
                                metadata[key] = 'null';
                            } else if (typeof value === 'object') {
                                metadata[key] = JSON.stringify(value);
                            } else {
                                metadata[key] = value;
                            }
                        }
                        return metadata;
                    });

                    await collection.add({
                        ids: batch.map((_, j) => `id_${i + j}`),
                        embeddings: embeddings,
                        metadatas: metadatas
                    });
                    console.log(`Processed and embedded batch ${i / batchSize + 1} of ${Math.ceil(knowledgeBase.length / batchSize)}`);
                    success = true;
                } catch (err) {
                    retries++;
                    console.error(`An error occurred during embedding batch ${i / batchSize + 1}. Retrying (${retries}/${maxRetries})...`, err.message);
                    if (retries < maxRetries) {
                        await new Promise(res => setTimeout(res, 2 ** retries * 1000)); // Exponential backoff
                    } else {
                        console.error(`Failed to process batch ${i / batchSize + 1} after ${maxRetries} retries. Skipping.`);
                    }
                }
            }
        }

        const count = await collection.count();
        console.log(`Collection now contains ${count} items.`);
        console.log('Knowledge base embedding complete.');
    }
}

EmbedKnowledgeBase.run().catch(err => {
    console.error(err);
    process.exit(1);
});
```

**File 3: `buildScripts/ai/queryKnowledgeBase.mjs`**

*This is the CLI tool for querying the knowledge base.*

```javascript
// buildScripts/ai/queryKnowledgeBase.mjs
import { ChromaClient } from 'chromadb';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

dotenv.config();

class QueryKnowledgeBase {
    static async run(query) {
        if (!query) {
            console.error('Error: A query string must be provided.');
            console.log('Usage: npm run ai:query -- --query "your search query"');
            return;
        }
        console.log(`Querying for: "${query}"...`);

        const dbClient = new ChromaClient();
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');
        
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

        let collection;
        try {
            collection = await dbClient.getCollection({ name: 'neo_knowledge' });
        } catch (err) {
            console.error('Could not connect to collection. Please run "npm run ai:build-kb" first.');
            return;
        }

        const queryEmbedding = await model.embedContent(query);
        const results = await collection.query({
            queryEmbeddings: [queryEmbedding.embedding.values],
            nResults: 15 // Fetch more results to allow for better ranking
        });

        if (results.metadatas?.length > 0 && results.metadatas[0].length > 0) {
            const sourceScores = {};
            const queryLower = query.toLowerCase();

            results.metadatas[0].forEach(metadata => {
                if (metadata.source && metadata.source !== 'unknown') {
                    let score = 1; // Base score for being in the results

                    // 1. Boost score for 'Base.mjs' files, as they are fundamental.
                    if (metadata.source.endsWith('Base.mjs')) {
                        score += 5;
                    }

                    // 2. Boost score for shorter paths (less nested files are often more fundamental).
                    const depth = metadata.source.split('/').length;
                    score += Math.max(0, 5 - depth);

                    // 3. Big boost for an exact class name match (e.g., query 'button' matches 'Neo.button.Button').
                    if (metadata.type === 'class' && metadata.name.toLowerCase().endsWith(`.${queryLower}`)) {
                        score += 10;
                    }

                    sourceScores[metadata.source] = (sourceScores[metadata.source] || 0) + score;
                }
            });

            if (Object.keys(sourceScores).length === 0) {
                console.log('No relevant source files found.');
                return;
            }

            // Sort by the new, weighted score instead of just the count
            const sortedSources = Object.entries(sourceScores).sort(([, a], [, b]) => b - a);
            
            console.log('\nMost relevant source files (by weighted score):');
            sortedSources.forEach(([source, score]) => {
                console.log(`- ${source} (Score: ${score.toFixed(0)})`);
            });
            console.log(`\nTop result: ${sortedSources[0][0]}`);
        } else {
            console.log('No results found for your query.');
        }
    }
}

const argv = yargs(hideBin(process.argv)).option('query', {
    alias: 'q',
    type: 'string',
    description: 'The search query for the knowledge base'
}).argv;

QueryKnowledgeBase.run(argv.query).catch(err => {
    console.error(err);
    process.exit(1);
});
```

---

## Step 5: Add `package.json` Scripts

Add the following scripts to the `scripts` section of the `package.json` in the `neo` repository.

```json
"scripts": {
  "ai:create-kb": "node buildScripts/ai/createKnowledgeBase.mjs",
  "ai:embed-kb": "node buildScripts/ai/embedKnowledgeBase.mjs",
  "ai:build-kb": "npm run ai:create-kb && npm run ai:embed-kb",
  "ai:query": "node buildScripts/ai/queryKnowledgeBase.mjs"
}
```

---

## Step 6: Running the System

1.  **Build the JSDoc output** if you haven't already. This is the primary source for the knowledge base.
    ```bash
    npm run generate-docs-json
    ```

2.  **Build the Knowledge Base**. This is a one-time process, or to be re-run whenever the docs or guides change significantly. It will create the local ChromaDB files inside a `chroma` directory in your project root (add this directory to `.gitignore`).
    ```bash
    npm run ai:build-kb
    ```
    This will run both the `create` and `embed` scripts. It may take a few minutes as it communicates with the Google AI API to generate embeddings.

3.  **Query the Knowledge Base**.
    ```bash
    npm run ai:query -- --query "How do I create a button?"
    ```
    Or using the alias:
    ```bash
    npm run ai:query -- -q "Tell me about layouts"
    ```
    The script will output the most relevant source file(s) based on your query. You can then use this information to inform your next steps.

## Comments

### @tobiu - 2025-09-18 18:15

```bash
tobiasuhlig@iMacPro neo % npm run ai:query -- -q "How do I create a button?"

> neo.mjs@10.5.4 ai:query
> node buildScripts/ai/queryKnowledgeBase.mjs -q How do I create a button?

Querying for: "How do I create a button?"...

Most relevant source files (by weighted score):
- /Users/Shared/github/neomjs/neo/src/button/Base.mjs (Score: 30)
- /Users/Shared/github/neomjs/neo/src/functional/button/Base.mjs (Score: 18)
- /Users/Shared/github/neomjs/neo/src/grid/header/Button.mjs (Score: 2)
- /Users/Shared/github/neomjs/neo/src/table/header/Button.mjs (Score: 2)
- /Users/Shared/github/neomjs/neo/src/component/mwc/Button.mjs (Score: 1)
- /Users/Shared/github/neomjs/neo/src/tab/header/Button.mjs (Score: 1)
- /Users/Shared/github/neomjs/neo/src/button/Effect.mjs (Score: 1)

Top result: /Users/Shared/github/neomjs/neo/src/button/Base.mjs
``` 

### @tobiu - 2025-09-19 12:21

<img width="995" height="663" alt="Image" src="https://github.com/user-attachments/assets/e4f015b3-2560-4ec5-868c-32ae05a4df86" />

