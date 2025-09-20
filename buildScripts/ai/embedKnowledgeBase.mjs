import {ChromaClient}       from 'chromadb';
import {GoogleGenerativeAI} from '@google/generative-ai';
import dotenv               from 'dotenv';
import fs                   from 'fs-extra';
import path                 from 'path';
import readline             from 'readline';

dotenv.config();

class EmbedKnowledgeBase {
    static async run() {
        console.log('Starting knowledge base embedding...');
        const projectRoot = process.cwd();

        const knowledgeBasePath = path.resolve(projectRoot, 'dist/ai-knowledge-base.jsonl');
        if (!await fs.pathExists(knowledgeBasePath)) {
            throw new Error(`Knowledge base not found at ${knowledgeBasePath}. Please run createKnowledgeBase.mjs first.`);
        }

        const knowledgeBase = [];
        const fileStream    = fs.createReadStream(knowledgeBasePath);
        const rl            = readline.createInterface({
            input    : fileStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            knowledgeBase.push(JSON.parse(line));
        }
        console.log(`Loaded ${knowledgeBase.length} knowledge chunks.`);

        // Build the inheritance map
        const classNameToDataMap = {};
        knowledgeBase.forEach(chunk => {
            if (chunk.type === 'class') {
                classNameToDataMap[chunk.name] = {
                    source: chunk.source,
                    parent: chunk.extends
                };
            }
        });

        // Pre-calculate inheritance chains for all chunks
        knowledgeBase.forEach(chunk => {
            let currentClass = chunk.type === 'class' ? chunk.name : chunk.className;
            const inheritanceChain = [];
            const visited = new Set();

            while (currentClass && classNameToDataMap[currentClass]?.parent && !visited.has(currentClass)) {
                visited.add(currentClass);
                const parentClassName = classNameToDataMap[currentClass].parent;
                const parentData      = classNameToDataMap[parentClassName];

                if (parentData) {
                    inheritanceChain.push({
                        className: parentClassName,
                        source   : parentData.source
                    });
                }
                currentClass = parentClassName;
            }
            chunk.inheritanceChain = inheritanceChain;
        });

        const dbClient       = new ChromaClient();
        const collectionName = 'neo_knowledge';

        // A dummy embedding function to satisfy the ChromaDB API, since we provide our own embeddings.
        const embeddingFunction = {
            generate: (texts) => {
                // This will not be called because we provide embeddings directly.
                console.log('Dummy embedding function called. This should not happen.');
                return Promise.resolve(texts.map(() => []));
            }
        };

        const originalLog = console.log;
        console.log = (...args) => {
            if (typeof args[0] === 'string' && args[0].includes('No embedding function configuration found')) {
                return;
            }
            originalLog.apply(console, args);
        };

        const collection = await dbClient.getOrCreateCollection({
            name             : collectionName,
            embeddingFunction: embeddingFunction
        });

        console.log = originalLog;

        console.log(`Using collection: ${collectionName}`);

        // 1. Fetch existing documents for comparison
        console.log('Fetching existing documents from ChromaDB...');
        const existingDocs    = await collection.get({include: ["metadatas"]});
        const existingDocsMap = new Map();

        existingDocs.ids.forEach((id, index) => {
            existingDocsMap.set(id, existingDocs.metadatas[index].hash);
        });
        console.log(`Found ${existingDocsMap.size} existing documents.`);

        // 2. Prepare for diffing
        const chunksToAdd    = [];
        const chunksToUpdate = [];
        const existingIds    = new Set(existingDocs.ids);

        // 3. Compare new chunks with existing ones
        knowledgeBase.forEach((chunk, index) => {
            const chunkId = `id_${index}`;

            if (existingDocsMap.has(chunkId)) {
                if (existingDocsMap.get(chunkId) !== chunk.hash) {
                    chunksToUpdate.push({ ...chunk, id: chunkId });
                }

                existingIds.delete(chunkId); // Mark this ID as still present
            } else {
                chunksToAdd.push({ ...chunk, id: chunkId });
            }
        });

        const idsToDelete = Array.from(existingIds);

        console.log(`${chunksToAdd.length   } chunks to add.`);
        console.log(`${chunksToUpdate.length} chunks to update.`);
        console.log(`${idsToDelete.length   } chunks to delete.`);

        // 4. Perform deletions
        if (idsToDelete.length > 0) {
            await collection.delete({ ids: idsToDelete });
            console.log(`Deleted ${idsToDelete.length} stale chunks.`);
        }

        // 5. Process additions and updates
        const chunksToProcess = [...chunksToAdd, ...chunksToUpdate];
        if (chunksToProcess.length === 0) {
            console.log('No changes detected. Knowledge base is up to date.');
            return;
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        console.log('Initialized Google AI embedding model: text-embedding-004.');

        console.log('Embedding chunks...');
        const batchSize  = 100;
        const maxRetries = 5;

        for (let i = 0; i < chunksToProcess.length; i += batchSize) {
            const batch        = chunksToProcess.slice(i, i + batchSize);
            const textsToEmbed = batch.map(chunk => `${chunk.type}: ${chunk.name} in ${chunk.className || ''}\n${chunk.description || chunk.content || ''}`);

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

                    await collection.upsert({
                        ids       : batch.map(chunk => chunk.id),
                        embeddings: embeddings,
                        metadatas : metadatas
                    });
                    console.log(`Processed and embedded batch ${i / batchSize + 1} of ${Math.ceil(chunksToProcess.length / batchSize)}`);
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
