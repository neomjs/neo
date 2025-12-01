import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../config.mjs';
import Base                 from '../../../../../src/core/Base.mjs';
import ChromaManager        from './ChromaManager.mjs';
import dotenv               from 'dotenv';
import path                 from 'path';

const {queryScoreWeights} = aiConfig;

const cwd       = process.cwd();
const insideNeo = process.env.npm_package_name?.includes('neo.mjs') ?? false;

dotenv.config({
    path : insideNeo ? path.resolve(cwd, '.env') : path.resolve(cwd, '../../.env'),
    quiet: true
});

/**
 * @summary Performs semantic search against the knowledge base.
 *
 * This service is responsible for performing semantic search against the knowledge base.
 * It takes a natural language query, generates an embedding for it, and queries the
 * ChromaDB vector store. It then applies a sophisticated scoring and ranking algorithm
 * to the results to provide the most relevant source files to the user.
 *
 * @class Neo.ai.mcp.server.knowledge-base.services.QueryService
 * @extends Neo.core.Base
 * @singleton
 */
class QueryService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.services.QueryService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.services.QueryService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Ensures the service is ready by waiting for ChromaManager.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await ChromaManager.ready();
    }

    /**
     * Performs a semantic search on the knowledge base using a natural language query.
     * Returns a scored and ranked list of the most relevant source files.
     * @param {String} query        The natural language search query.
     * @param {String} [type='all'] The content type to filter by. Valid values: 'all', 'blog', 'guide', 'src', 'example', 'ticket', 'release'.
     * @param {Number} [limit=25]   The maximum number of results to return.
     * @returns {Promise<Object>} A promise that resolves to the query results object.
     */
    async queryDocuments({query, type='all', limit=25}) {
        if (!query) {
            throw new Error('A query string must be provided.');
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            throw new Error('The GEMINI_API_KEY environment variable is not set.');
        }

        const genAI          = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model          = genAI.getGenerativeModel({model: aiConfig.embeddingModel});
        const collection     = await ChromaManager.getKnowledgeBaseCollection();
        const queryEmbedding = await model.embedContent(query);
        const queryLower     = query.toLowerCase();

        const whereClause = (type && type !== 'all') ? { type } : {};

        const queryOptions = {
            queryEmbeddings: [queryEmbedding.embedding.values],
            nResults       : aiConfig.nResults,
            where          : whereClause
        };

        if (Object.keys(whereClause).length === 0) {
            delete queryOptions.where;
        }

        const results = await collection.query(queryOptions);

        if (!results.metadatas || results.metadatas.length === 0 || results.metadatas[0].length === 0) {
            return {message: 'No results found for your query and type.'};
        }

        const sourceScores = {};
        const queryWords   = queryLower.replace(/[^a-zA-Z ]/g, '').split(' ').filter(w => w.length > 2);

        results.metadatas[0].forEach((metadata, index) => {
            if (!metadata.source || metadata.source === 'unknown') return;

            let score             = (results.metadatas[0].length - index) * queryScoreWeights.baseIncrement;
            const sourcePath      = metadata.source;
            const sourcePathLower = sourcePath.toLowerCase();
            const fileName        = sourcePath.split('/').pop().toLowerCase();
            const nameLower       = (metadata.name || '').toLowerCase();

            queryWords.forEach(queryWord => {
                const keyword = queryWord;
                const keywordSingular = keyword.endsWith('s') ? keyword.slice(0, -1) : keyword;

                if (keywordSingular.length > 2) {
                    if (sourcePathLower.includes(`/${keywordSingular}/`)) score += queryScoreWeights.sourcePathMatch;
                    if (fileName.includes(keywordSingular)) score += queryScoreWeights.fileNameMatch;
                    if (metadata.type === 'class' && nameLower.includes(keywordSingular)) score += queryScoreWeights.classNameMatch;
                    if (metadata.className && metadata.className.toLowerCase().includes(keywordSingular)) score += queryScoreWeights.classNameMatch;

                    if (metadata.type === 'guide') score += queryScoreWeights.guideMatch;
                    if (metadata.type === 'blog') {
                        score += queryScoreWeights.blogMatch;
                        if (nameLower.includes(keywordSingular)) score += queryScoreWeights.guideMatch;
                    }

                    const nameParts = nameLower.split('.');
                    if (nameParts.includes(keywordSingular)) score += queryScoreWeights.namePartMatch;
                }
            });

            if (metadata.type === 'ticket' && type === 'all') score += queryScoreWeights.ticketPenalty;
            if (metadata.type === 'release') score += queryScoreWeights.releasePenalty;
            if (fileName.endsWith('base.mjs')) score += queryScoreWeights.baseFileBonus;
            if (metadata.type === 'release' && queryLower.startsWith('v') && nameLower === queryLower) score += queryScoreWeights.releaseExactMatch;

            sourceScores[sourcePath] = (sourceScores[sourcePath] || 0) + score;

            const inheritanceChain = JSON.parse(metadata.inheritanceChain || '[]');
            let boost = queryScoreWeights.inheritanceBoost;
            inheritanceChain.forEach(parent => {
                if (parent.source) {
                    sourceScores[parent.source] = (sourceScores[parent.source] || 0) + boost;
                }
                boost = Math.floor(boost * queryScoreWeights.inheritanceDecay);
            });
        });

        if (Object.keys(sourceScores).length === 0) {
            return {message: 'No relevant source files found for the specified type.'};
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
            .slice(0, limit)
            .map(([source, score]) => ({ source, score: score.toFixed(0) }));

        if (finalSorted.length > 0) {
            return {
                topResult: finalSorted[0].source,
                results  : finalSorted
            };
        }

        return {message: 'No relevant source files found after scoring.'};
    }
}

export default Neo.setupClass(QueryService);
