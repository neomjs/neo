import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../config.mjs';
import Base                 from '../../../../../src/core/Base.mjs';
import ChromaManager        from './ChromaManager.mjs';
import dotenv               from 'dotenv';
import path                 from 'path';
import { SCORE_WEIGHTS } from '../config.mjs';

const cwd = process.cwd();
const insideNeo = process.env.npm_package_name?.includes('neo.mjs') ?? false;
dotenv.config({
    path: insideNeo ? path.resolve(cwd, '.env') : path.resolve(cwd, '../../.env'),
    quiet: true
});

/**
 * This service is responsible for performing semantic search against the knowledge base.
 * It takes a natural language query, generates an embedding for it, and queries the
 * ChromaDB vector store. It then applies a sophisticated scoring and ranking algorithm
 * to the results to provide the most relevant source files to the user.
 * @class Neo.ai.mcp.server.knowledge-base.service.QueryService
 * @extends Neo.core.Base
 * @singleton
 */
class QueryService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.service.QueryService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.service.QueryService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Performs a semantic search on the knowledge base using a natural language query.
     * Returns a scored and ranked list of the most relevant source files.
     * @param {string} query - The natural language search query.
     * @param {string} [type='all'] - The content type to filter by.
     * @returns {Promise<object>} A promise that resolves to the query results object.
     */
    async queryDocuments({ query, type = 'all' }) {
        if (!query) {
            throw new Error('A query string must be provided.');
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            throw new Error('The GEMINI_API_KEY environment variable is not set.');
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: aiConfig.embeddingModel });

        const collection = await ChromaManager.getKnowledgeBaseCollection();

        const queryEmbedding = await model.embedContent(query);
        const queryLower = query.toLowerCase();

        const whereClause = (type && type !== 'all') ? { type } : {};

        const queryOptions = {
            queryEmbeddings: [queryEmbedding.embedding.values],
            nResults: aiConfig.nResults,
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

            let score = (results.metadatas[0].length - index) * SCORE_WEIGHTS.BASE_INCREMENT;
            const sourcePath = metadata.source;
            const sourcePathLower = sourcePath.toLowerCase();
            const fileName = sourcePath.split('/').pop().toLowerCase();
            const nameLower = (metadata.name || '').toLowerCase();

            queryWords.forEach(queryWord => {
                const keyword = queryWord;
                const keywordSingular = keyword.endsWith('s') ? keyword.slice(0, -1) : keyword;

                if (keywordSingular.length > 2) {
                    if (sourcePathLower.includes(`/${keywordSingular}/`)) score += SCORE_WEIGHTS.SOURCE_PATH_MATCH;
                    if (fileName.includes(keywordSingular)) score += SCORE_WEIGHTS.FILE_NAME_MATCH;
                    if (metadata.type === 'class' && nameLower.includes(keywordSingular)) score += SCORE_WEIGHTS.CLASS_NAME_MATCH;
                    if (metadata.className && metadata.className.toLowerCase().includes(keywordSingular)) score += SCORE_WEIGHTS.CLASS_NAME_MATCH;

                    if (metadata.type === 'guide') score += SCORE_WEIGHTS.GUIDE_MATCH;
                    if (metadata.type === 'blog') {
                        score += SCORE_WEIGHTS.BLOG_MATCH;
                        if (nameLower.includes(keywordSingular)) score += SCORE_WEIGHTS.GUIDE_MATCH;
                    }

                    const nameParts = nameLower.split('.');
                    if (nameParts.includes(keywordSingular)) score += SCORE_WEIGHTS.NAME_PART_MATCH;
                }
            });

            if (metadata.type === 'ticket' && type === 'all') score += SCORE_WEIGHTS.TICKET_PENALTY;
            if (metadata.type === 'release') score += SCORE_WEIGHTS.RELEASE_PENALTY;
            if (fileName.endsWith('base.mjs')) score += SCORE_WEIGHTS.BASE_FILE_BONUS;
            if (metadata.type === 'release' && queryLower.startsWith('v') && nameLower === queryLower) score += SCORE_WEIGHTS.RELEASE_EXACT_MATCH;

            sourceScores[sourcePath] = (sourceScores[sourcePath] || 0) + score;

            const inheritanceChain = JSON.parse(metadata.inheritanceChain || '[]');
            let boost = SCORE_WEIGHTS.INHERITANCE_BOOST;
            inheritanceChain.forEach(parent => {
                if (parent.source) {
                    sourceScores[parent.source] = (sourceScores[parent.source] || 0) + boost;
                }
                boost = Math.floor(boost * SCORE_WEIGHTS.INHERITANCE_DECAY);
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
}

export default Neo.setupClass(QueryService);
