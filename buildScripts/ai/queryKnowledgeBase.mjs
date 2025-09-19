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
            nResults: 50 // Fetch more results to allow for better ranking
        });

        if (results.metadatas?.length > 0 && results.metadatas[0].length > 0) {
            const sourceScores = {};
            const queryLower = query.toLowerCase();
            const queryWords = queryLower.replace(/[^a-zA-Z ]/g, '').split(' ').filter(w => w.length > 2);
            const mainKeyword = queryWords[queryWords.length - 1] || '';
            const keywordSingular = mainKeyword.endsWith('s') ? mainKeyword.slice(0, -1) : mainKeyword;

            results.metadatas[0].forEach((metadata, index) => {
                if (!metadata.source || metadata.source === 'unknown') {
                    return;
                }

                let score = (results.metadatas[0].length - index) * 1; // Base score from vector search rank

                const sourcePath = metadata.source;
                const sourcePathLower = sourcePath.toLowerCase();
                const fileName = sourcePath.split('/').pop().toLowerCase();
                const nameLower = (metadata.name || '').toLowerCase();

                const keyword = keywordSingular;

                if (keyword) {
                    // 1. Path contains keyword directory
                    if (sourcePathLower.includes(`/${keyword}/`)) {
                        score += 40;
                    }

                    // 2. Filename contains keyword
                    if (fileName.includes(keyword)) {
                        score += 30;
                    }

                    // 3. Class name contains keyword
                    if (metadata.type === 'class' && nameLower.includes(keyword)) {
                        score += 20;
                    }
                    
                    // 4. Member of a class that contains keyword
                    if (metadata.className && metadata.className.toLowerCase().includes(keyword)) {
                        score += 20;
                    }

                    // 5. Boost for guides
                    if (metadata.type === 'guide') {
                        score += 30;
                        // Big boost if guide name matches
                        if (nameLower.includes(keyword)) {
                            score += 50;
                        }
                    }

                    // 6. Boost for Base.mjs files
                    if (fileName.endsWith('base.mjs')) {
                        score += 20;
                    }
                    
                    // 7. Boost for exact matches on class name parts
                    const nameParts = nameLower.split('.');
                    if (nameParts.includes(keyword)) {
                        score += 30;
                    }
                }

                sourceScores[sourcePath] = (sourceScores[sourcePath] || 0) + score;
            });

            if (Object.keys(sourceScores).length === 0) {
                console.log('No relevant source files found.');
                return;
            }

            // Sort by the new, weighted score
            const sortedSources = Object.entries(sourceScores).sort(([, a], [, b]) => b - a);

            console.log('\nMost relevant source files (by weighted score):');
            sortedSources.slice(0, 25).forEach(([source, score]) => {
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
