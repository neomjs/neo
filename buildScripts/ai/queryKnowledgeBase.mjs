import {ChromaClient}       from 'chromadb';
import {GoogleGenerativeAI} from '@google/generative-ai';
import {Command}            from 'commander/esm.mjs';
import dotenv               from 'dotenv';
import fs                   from 'fs-extra';
import path                 from 'path';

const
    cwd       = process.cwd(),
    insideNeo = process.env.npm_package_name.includes('neo.mjs');

dotenv.config({
    path: insideNeo ? path.resolve(cwd, '.env') : path.resolve(cwd, '../../.env'),
    quiet: true
});

const program = new Command();

program
    .name('neo-ai-query')
    .version('1.0.0') // Or from package.json
    .option('-q, --query <value>', 'The search query for the knowledge base')
    .option('-t, --type <value>', 'The content type to query for. Choices: all, blog, guide, src, example', 'all')
    .parse(process.argv);

const opts = program.opts();

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
    static async run(query, type) {
        if (!query) {
            console.error('Error: A query string must be provided.');
            console.log('Usage: npm run ai:query -- -q "your search query"');
            return;
        }

        console.log(`Querying for: "${query}" (type: ${type})...
`);

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
            nResults       : 100 // Increased to get a wider net for filtering
        });

        // 2. Filter results by content type if specified
        if (type && type !== 'all') {
            results.metadatas[0] = results.metadatas[0].filter(metadata => {
                const source = metadata.source || '';
                switch (type) {
                    case 'blog':
                        return source.includes('/learn/blog/');
                    case 'guide':
                        return source.includes('/learn/guides/');
                    case 'src':
                        return source.includes('/src/');
                    case 'example':
                        return source.includes('/examples/');
                    case 'release':
                        return source.includes('/.github/RELEASE_NOTES/');
                    default:
                        return true;
                }
            });
        }

        // 3. Process results with the enhanced scoring algorithm
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
                        // Guides are the most authoritative source for how-to information.
                        score += metadata.isBlog === 'true' ? 5 : 50;
                        if (nameLower.includes(keyword)) score += 50;
                    }
                    if (metadata.type === 'release') {
                        score -= 50; // Penalize release notes in general queries
                    }
                    if (fileName.endsWith('base.mjs')) score += 20;
                    const nameParts = nameLower.split('.');
                    if (nameParts.includes(keyword)) score += 30;
                }

                // Boost exact matches for version-like queries
                if (metadata.type === 'release' && queryLower.startsWith('v') && nameLower === queryLower) {
                    score += 1000; // Strong boost for exact version match
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
                console.log('No relevant source files found for the specified type.');
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

            if (finalSorted.length > 0) {
                console.log(`\nTop result: ${finalSorted[0][0]}`);
            } else {
                console.log('No relevant source files found after scoring.');
            }
        } else {
            console.log('No results found for your query and type.');
        }
    }
}

QueryKnowledgeBase.run(opts.query, opts.type).catch(err => {
    console.error(err);
    process.exit(1);
});
