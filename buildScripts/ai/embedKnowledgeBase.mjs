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

        const collection = await dbClient.createCollection({
            name: collectionName,
            embeddingFunction: embeddingFunction
        });

        console.log = originalLog;
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
