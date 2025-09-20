import {ChromaClient}       from 'chromadb';
import {GoogleGenerativeAI} from '@google/generative-ai';
import dotenv               from 'dotenv';
import fs                   from 'fs-extra';
import path                 from 'path';
import yargs                from 'yargs';
import {hideBin}            from 'yargs/helpers';

dotenv.config({quiet: true});

/**
 * This script is the final stage in the AI knowledge base pipeline: **Query**.
 *
 * Its purpose is to provide a fast and efficient way to search the knowledge base.
 * It takes a user's natural language query, converts it into a vector embedding, and uses that
 * to find the most relevant documents in the ChromaDB vector database.
 *
 * Key architectural features:
 * - **Lightweight & Fast:** This script is designed to be extremely performant. It does NOT read any
 *   large JSON files from the filesystem. All necessary data is retrieved directly from the database.
 * - **Dynamic Scoring:** It applies a scoring algorithm to the results returned by the database.
 *   This includes:
 *     - A base score from the semantic similarity search.
 *     - Dynamic boosts based on matching keywords from the query against the chunk's properties.
 *     - An inheritance boost, which is calculated quickly by using the pre-computed `inheritanceChain`
 *       stored in the metadata of each result.
 *
 * The design philosophy is to offload all heavy, static pre-processing to the `embed` phase,
 * allowing this `query` phase to be as quick and responsive as possible.
 *
 * @class QueryKnowledgeBase
 */
class QueryKnowledgeBase {
    static async run(query) {
        if (!query) {
            console.error('Error: A query string must be provided.');
            console.log('Usage: npm run ai:query -- --query "your search query"');
            return;
        }

        console.log(`Querying for: "${query}"...`);

        // 1. Connect to ChromaDB and get query results
        const dbClient       = new ChromaClient();
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

        let collection;
        try {
            const originalLog = console.warn;
            console.warn = () => {};
            collection = await dbClient.getCollection({ name: 'neo_knowledge' });
            console.warn = originalLog;
        } catch (err) {
            console.error('Could not connect to collection. Please run "npm run ai:build-kb" first.');
            return;
        }

        const queryEmbedding = await model.embedContent(query);
        const results        = await collection.query({
            queryEmbeddings: [queryEmbedding.embedding.values],
            nResults       : 50
        });

        // 2. Process results with the enhanced scoring algorithm
        if (results.metadatas?.length > 0 && results.metadatas[0].length > 0) {
            const sourceScores    = {};
            const queryLower      = query.toLowerCase();
            const queryWords      = queryLower.replace(/[^a-zA-Z ]/g, '').split(' ').filter(w => w.length > 2);
            const mainKeyword     = queryWords[queryWords.length - 1] || '';
            const keywordSingular = mainKeyword.endsWith('s') ? mainKeyword.slice(0, -1) : mainKeyword;

            results.metadatas[0].forEach((metadata, index) => {
                if (!metadata.source || metadata.source === 'unknown') return;

                let score = (results.metadatas[0].length - index) * 1;

                const sourcePath      = metadata.source;
                const sourcePathLower = sourcePath.toLowerCase();
                const fileName        = sourcePath.split('/').pop().toLowerCase();
                const nameLower       = (metadata.name || '').toLowerCase();
                const keyword         = keywordSingular;

                if (keyword) {
                    if (sourcePathLower.includes(`/${keyword}/`)) score += 40;
                    if (fileName.includes(keyword)) score += 30;
                    if (metadata.type === 'class' && nameLower.includes(keyword)) score += 20;
                    if (metadata.className && metadata.className.toLowerCase().includes(keyword)) score += 20;
                    if (metadata.type === 'guide') {
                        // Blog posts are useful, but guides are more authoritative
                        score += metadata.isBlog === 'true' ? 15 : 30;
                        if (nameLower.includes(keyword)) score += 50;
                    }
                    if (fileName.endsWith('base.mjs')) score += 20;
                    const nameParts = nameLower.split('.');
                    if (nameParts.includes(keyword)) score += 30;
                }

                sourceScores[sourcePath] = (sourceScores[sourcePath] || 0) + score;

                // Apply inheritance boost
                const inheritanceChain = JSON.parse(metadata.inheritanceChain || '[]');
                let boost = 80;

                inheritanceChain.forEach(parent => {
                    if (parent.source) {
                        sourceScores[parent.source] = (sourceScores[parent.source] || 0) + boost;
                    }
                    boost = Math.floor(boost * 0.6);
                });
            });

            if (Object.keys(sourceScores).length === 0) {
                console.log('No relevant source files found.');
                return;
            }

            const sortedSources = Object.entries(sourceScores).sort(([, a], [, b]) => b - a);

            // Final pass for context boost (e.g., boost files in the same directory as top results)
            const finalScores = {};
            const topSourceDirs = sortedSources.slice(0, 5).map(([source]) => path.dirname(source));

            sortedSources.forEach(([source, score]) => {
                let finalScore = score;
                const sourceDir = path.dirname(source);
                if (topSourceDirs.includes(sourceDir)) {
                    finalScore *= 1.1;
                }
                finalScores[source] = finalScore;
            });

            const finalSorted = Object.entries(finalScores).sort(([, a], [, b]) => b - a);

            console.log('\nMost relevant source files (by weighted score):');
            finalSorted.slice(0, 25).forEach(([source, score]) => {
                console.log(`- ${source} (Score: ${score.toFixed(0)})`);
            });
            console.log(`\nTop result: ${finalSorted[0][0]}`);
        } else {
            console.log('No results found for your query.');
        }
    }
}

const argv = yargs(hideBin(process.argv)).option('query', {
    alias      : 'q',
    type       : 'string',
    description: 'The search query for the knowledge base'
}).argv;

QueryKnowledgeBase.run(argv.query).catch(err => {
    console.error(err);
    process.exit(1);
});