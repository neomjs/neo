import fs                   from 'fs-extra';
import TextEmbeddingService from '../memory-core/TextEmbeddingService.mjs';
import mcConfig             from '../../mcp/server/memory-core/config.mjs';
import aiConfig             from '../../mcp/server/knowledge-base/config.mjs';
import Base                 from '../../../src/core/Base.mjs';
import ChromaManager        from './ChromaManager.mjs';
import {buildReadWhereClause} from './readVisibilityFilter.mjs';
import dotenv               from 'dotenv';
import path                 from 'path';

const {queryScoreWeights} = aiConfig;

const cwd       = aiConfig.neoRootDir;
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
 * @class Neo.ai.services.knowledge-base.QueryService
 * @extends Neo.core.Base
 * @singleton
 */
class QueryService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.QueryService'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.QueryService',
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
     * Retrieves the static class hierarchy from the pre-generated JSON file.
     * @param {Object} params
     * @param {String} params.root Root class name to filter the hierarchy (e.g., 'Neo.component.Base').
     * @returns {Promise<Object>} The class hierarchy map or subtree.
     */
    async getClassHierarchy({root} = {}) {
        if (!root) {
            throw new Error('The "root" parameter is required to prevent excessive context payload. Please specify a root class (e.g., "Neo.component.Base").');
        }

        if (!await fs.pathExists(aiConfig.hierarchyPath)) {
            throw new Error('Class hierarchy file not found. Please sync the knowledge base first.');
        }

        const hierarchy = await fs.readJson(aiConfig.hierarchyPath);

        // If a root is specified, find all subclasses recursively
        const subtree = {};
        const queue = [root];

        // Include the root itself if it exists (parent is the value)
        if (Object.hasOwn(hierarchy, root)) {
            subtree[root] = hierarchy[root];
        }

        while (queue.length > 0) {
            const currentParent = queue.shift();

            Object.entries(hierarchy).forEach(([className, parentName]) => {
                if (parentName === currentParent) {
                    subtree[className] = parentName;
                    queue.push(className);
                }
            });
        }

        if (Object.keys(subtree).length === 0 && !Object.hasOwn(hierarchy, root)) {
             return { message: `Class '${root}' found in hierarchy, but it has no subclasses or entry.` };
        }

        return subtree;
    }

    /**
     * Performs a semantic search on the knowledge base using a natural language query.
     * Returns a scored and ranked list of the most relevant source files.
     * @param {String}  query                         The natural language search query.
     * @param {String}  [type='all']                  The content type to filter by. Valid values: 'all', 'blog', 'guide', 'src', 'example', 'ticket', 'release'.
     * @param {Number}  [limit=25]                    The maximum number of results to return.
     * @param {Boolean} [includeMetadata=false]       Internal hydration flag for RAG synthesis callers.
     * @returns {Promise<Object>} A promise that resolves to the query results object.
     */
    async queryDocuments({query, type='all', limit=25, includeMetadata=false}) {
        if (!query) {
            throw new Error('A query string must be provided.');
        }

        const collection           = await ChromaManager.getKnowledgeBaseCollection();
        const queryEmbeddingValues = await TextEmbeddingService.embedText(query, mcConfig.embeddingProvider);
        const queryLower     = query.toLowerCase();

        // Tenant isolation (#11632) + per-chunk visibility (#12163), derived from the authenticated
        // request context (see readVisibilityFilter). A forged client `tenantId` arg is ignored; an
        // offline / no-context daemon gets no filter, byte-equivalent with pre-#11632 behavior.
        const whereClause = buildReadWhereClause((type && type !== 'all') ? {type} : {});

        const queryOptions = {
            queryEmbeddings: [queryEmbeddingValues],
            nResults       : aiConfig.nResults
        };

        if (whereClause) {
            queryOptions.where = whereClause;
        }

        const results = await collection.query(queryOptions);

        if (!results.metadatas || results.metadatas.length === 0 || results.metadatas[0].length === 0) {
            return {message: 'No results found for your query and type.'};
        }

        const sourceScores   = {};
        const sourceMetadata = {};
        const queryWords     = queryLower.replace(/[^a-zA-Z ]/g, '').split(' ').filter(w => w.length > 2);

        results.metadatas[0].forEach((metadata, index) => {
            if (!metadata.source || metadata.source === 'unknown') return;

            let score             = (results.metadatas[0].length - index) * queryScoreWeights.baseIncrement;
            const sourcePath      = metadata.source;
            const sourcePathLower = sourcePath.toLowerCase();
            const fileName        = sourcePath.split('/').pop().toLowerCase();
            const nameLower       = (metadata.name || '').toLowerCase();

            // Chroma returns chunk metadata in relevance order. Keep the highest-ranked
            // source metadata available for SearchService hydration without changing the
            // public queryDocuments result shape unless explicitly requested.
            if (!sourceMetadata[sourcePath]) {
                sourceMetadata[sourcePath] = metadata;
            }

            queryWords.forEach(queryWord => {
                const keyword = queryWord;
                const keywordSingular = keyword.endsWith('s') ? keyword.slice(0, -1) : keyword;

                if (keywordSingular.length > 2) {
                    if (sourcePathLower.includes(`/${keywordSingular}/`)) score += queryScoreWeights.sourcePathMatch;
                    if (fileName.includes(keywordSingular)) score += queryScoreWeights.fileNameMatch;

                    // Old JSDoc based check: metadata.type === 'class'
                    // New SourceParser check: metadata.className exists
                    if (metadata.className && metadata.className.toLowerCase().includes(keywordSingular)) {
                         score += queryScoreWeights.classNameMatch;
                    }

                    if (metadata.type === 'guide') score += queryScoreWeights.guideMatch;
                    if (metadata.type === 'concept') score += queryScoreWeights.conceptMatch;
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
            .map(([source, score]) => {
                const result = {source, score: score.toFixed(0)};

                if (includeMetadata) {
                    result.metadata = sourceMetadata[source] || {};
                }

                return result;
            });

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
