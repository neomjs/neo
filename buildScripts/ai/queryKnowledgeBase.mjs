// buildScripts/ai/queryKnowledgeBase.mjs
import { ChromaClient } from 'chromadb';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

dotenv.config({quiet: true});

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
            // Silencing "No embedding function configuration found for collection neo_knowledge."
            const originalLog = console.warn;
            console.warn = () => {};
            collection = await dbClient.getCollection({ name: 'neo_knowledge' });

            console.warn = originalLog;
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
