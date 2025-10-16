import { ChromaClient } from 'chromadb';
import { GoogleGenerativeAI } from '@google/generative-ai';
import aiConfig from '../../../../buildScripts/ai/aiConfig.mjs';
import dotenv from 'dotenv';
import path from 'path';

// TODO: This dotenv config needs a more robust solution.
const cwd = process.cwd();
const insideNeo = process.env.npm_package_name?.includes('neo.mjs') ?? false;
dotenv.config({
    path: insideNeo ? path.resolve(cwd, '.env') : path.resolve(cwd, '../../.env'),
    quiet: true
});

/**
 * Performs a semantic search on the knowledge base using a natural language query.
 * Returns a scored and ranked list of the most relevant source files.
 * @param {string} query - The natural language search query.
 * @param {string} [type='all'] - The content type to filter by.
 * @returns {Promise<object>} A promise that resolves to the query results object.
 */
async function queryDocuments({ query, type = 'all' }) {
    if (!query) {
        throw new Error('A query string must be provided.');
    }

    const dbClient = new ChromaClient();
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        throw new Error('The GEMINI_API_KEY environment variable is not set.');
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: aiConfig.knowledgeBase.embeddingModel });

    let collection;
    try {
        const originalWarn = console.warn;
        console.warn = () => {}; // Suppress unwanted warnings from ChromaDB client
        collection = await dbClient.getCollection({ name: aiConfig.knowledgeBase.collectionName });
        console.warn = originalWarn;
    } catch (err) {
        throw new Error('Could not connect to collection. Please run the sync process first.');
    }

    const queryEmbedding = await model.embedContent(query);
    const queryLower = query.toLowerCase();

    const whereClause = (type && type !== 'all') ? { type } : {};

    const queryOptions = {
        queryEmbeddings: [queryEmbedding.embedding.values],
        nResults: aiConfig.knowledgeBase.nResults,
        where: whereClause
    };

    if (Object.keys(whereClause).length === 0) {
        delete queryOptions.where;
    }

    const results = await collection.query(queryOptions);

    if (!results.metadatas || results.metadatas.length === 0 || results.metadatas[0].length === 0) {
        return { message: 'No results found for your query and type.' };
    }

    const sourceScores = {};
    const queryWords = queryLower.replace(/[^a-zA-Z ]/g, '').split(' ').filter(w => w.length > 2);

    results.metadatas[0].forEach((metadata, index) => {
        if (!metadata.source || metadata.source === 'unknown') return;

        let score = (results.metadatas[0].length - index) * 1;
        const sourcePath = metadata.source;
        const sourcePathLower = sourcePath.toLowerCase();
        const fileName = sourcePath.split('/').pop().toLowerCase();
        const nameLower = (metadata.name || '').toLowerCase();

        queryWords.forEach(queryWord => {
            const keyword = queryWord;
            const keywordSingular = keyword.endsWith('s') ? keyword.slice(0, -1) : keyword;

            if (keywordSingular.length > 2) {
                if (sourcePathLower.includes(`/${keywordSingular}/`)) score += 40;
                if (fileName.includes(keywordSingular)) score += 30;
                if (metadata.type === 'class' && nameLower.includes(keywordSingular)) score += 20;
                if (metadata.className && metadata.className.toLowerCase().includes(keywordSingular)) score += 20;
                if (metadata.type === 'guide' || metadata.type === 'blog') {
                    score += metadata.type === 'blog' ? 5 : 50;
                    if (nameLower.includes(keywordSingular)) score += 50;
                }
                const nameParts = nameLower.split('.');
                if (nameParts.includes(keywordSingular)) score += 30;
            }
        });

        if (metadata.type === 'ticket' && type === 'all') score -= 70;
        if (metadata.type === 'release') score -= 50;
        if (fileName.endsWith('base.mjs')) score += 20;
        if (metadata.type === 'release' && queryLower.startsWith('v') && nameLower === queryLower) score += 1000;

        sourceScores[sourcePath] = (sourceScores[sourcePath] || 0) + score;

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
        return { message: 'No relevant source files found for the specified type.' };
    }

    const sortedSources = Object.entries(sourceScores).sort(([, a], [, b]) => b - a);
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

    const finalSorted = Object.entries(finalScores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 25)
        .map(([source, score]) => ({ source, score: score.toFixed(0) }));

    if (finalSorted.length > 0) {
        return {
            topResult: finalSorted[0].source,
            results: finalSorted
        };
    }

    return { message: 'No relevant source files found after scoring.' };
}

export { queryDocuments };
