import fs                   from 'fs-extra';
import TextEmbeddingService from '../memory-core/TextEmbeddingService.mjs';
import mcConfig             from '../../mcp/server/memory-core/config.mjs';
import aiConfig             from '../../mcp/server/knowledge-base/config.mjs';
import Base                 from '../../../src/core/Base.mjs';
import ChromaManager        from './ChromaManager.mjs';
import RequestContextService, {normalizeUserId} from '../../mcp/server/shared/services/RequestContextService.mjs';
import dotenv               from 'dotenv';
import path                 from 'path';

const {queryScoreWeights} = aiConfig;

const cwd       = aiConfig.neoRootDir;
const insideNeo = process.env.npm_package_name?.includes('neo.mjs') ?? false;
const lexicalRescueExtensions = new Set(['.js', '.json', '.md', '.mjs', '.yaml', '.yml']);
const lexicalRescueSkipDirs   = new Set([
    '.git',
    '.neo-ai-data',
    'coverage',
    'dist',
    'docs/output',
    'node_modules',
    'playwright-report',
    'test-results'
]);
const codeTermRescueRoots     = ['ai/services', 'ai/mcp/server', 'ai/graph'];
const codeTermRescueFileLimit = 500;

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
        const queryLower           = query.toLowerCase();

        const whereClause = (type && type !== 'all') ? { type } : {};

        // Read-side tenant filter: a requester retrieves its own tenant's chunks plus
        // Neo's curated `neo-shared` corpus. The requester is derived server-side from the
        // authenticated request context — never from a client-supplied parameter (a forged
        // `tenantId` query arg is therefore ignored). No request context (stdio single-tenant
        // / offline daemon) → no tenant filter, byte-equivalent with the legacy behavior.
        const requesterTenantId = normalizeUserId(RequestContextService.getUserId());
        if (requesterTenantId) {
            whereClause.tenantId = {$in: [requesterTenantId, aiConfig.defaultTenantId]};
        }

        const queryOptions = {
            queryEmbeddings: [queryEmbeddingValues],
            nResults       : aiConfig.nResults,
            where          : whereClause
        };

        if (Object.keys(whereClause).length === 0) {
            delete queryOptions.where;
        }

        const results        = await collection.query(queryOptions);
        const sourceScores   = {};
        const sourceMetadata = {};
        const metadatas      = results.metadatas?.[0] || [];
        const queryWords     = this.getQueryWords(queryLower);

        metadatas.forEach((metadata, index) => {
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

        await this.addLexicalRescueScores({
            query,
            queryLower,
            queryWords,
            sourceMetadata,
            sourceScores,
            type
        });

        if (Object.keys(sourceScores).length === 0) {
            return {message: 'No results found for your query and type.'};
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

    /**
     * @summary Normalizes query text into scoring words while preserving numerical anchors.
     * @param {String} queryLower Lower-cased query string.
     * @returns {String[]} Query words longer than two characters.
     */
    getQueryWords(queryLower) {
        return queryLower.replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 2);
    }

    /**
     * @summary Adds bounded local-source rescue scores for high-specificity exact anchors.
     *
     * Vector retrieval remains the primary path. This rescue only contributes default Neo
     * checkout sources when the user names concrete local anchors such as file paths,
     * filenames, guide titles, or code-ish identifiers. It protects `ask_knowledge_base`
     * from sounding like current repo evidence is absent when the semantic top-k omits an
     * exact Brain / graph substrate file.
     *
     * @param {Object} options
     * @param {String} options.query Full query string.
     * @param {String} options.queryLower Lower-cased query.
     * @param {String[]} options.queryWords Tokenized query words.
     * @param {Object} options.sourceMetadata Mutable source metadata map.
     * @param {Object} options.sourceScores Mutable source score map.
     * @param {String} options.type Requested content type.
     * @returns {Promise<void>}
     */
    async addLexicalRescueScores({query, queryLower, queryWords, sourceMetadata, sourceScores, type}) {
        const candidates = await this.getLexicalRescueCandidates({query, queryLower, queryWords, type});
        const rescueBase = queryScoreWeights.lexicalRescueMatch || queryScoreWeights.sourcePathMatch * 80;

        candidates.forEach(candidate => {
            if (type && type !== 'all' && candidate.type && candidate.type !== type) {
                return;
            }

            sourceScores[candidate.source] = (sourceScores[candidate.source] || 0) + rescueBase + candidate.score;

            if (!sourceMetadata[candidate.source]) {
                sourceMetadata[candidate.source] = {
                    source              : candidate.source,
                    type                : candidate.type,
                    name                : candidate.name || path.basename(candidate.source),
                    repoSlug            : aiConfig.defaultRepoSlug,
                    tenantId            : aiConfig.defaultTenantId,
                    inheritanceChain    : '[]',
                    lexicalRescueReasons: candidate.reasons.join(', ')
                };
            }
        });
    }

    /**
     * @summary Finds local Neo sources named directly by path, filename, guide title, or code term.
     * @param {Object} options
     * @param {String} options.query Full query string.
     * @param {String} options.queryLower Lower-cased query.
     * @param {String[]} options.queryWords Tokenized query words.
     * @param {String} options.type Requested content type.
     * @returns {Promise<Object[]>} Local rescue candidates.
     */
    async getLexicalRescueCandidates({query, queryLower, queryWords, type}) {
        const candidateMap = new Map();
        const addCandidate = async (source, reason, score = 0) => {
            const normalizedSource = this.normalizeSourcePath(source);

            if (!normalizedSource || !lexicalRescueExtensions.has(path.extname(normalizedSource).toLowerCase())) {
                return;
            }

            if (type && type !== 'all' && this.inferSourceType(normalizedSource) !== type) {
                return;
            }

            const absoluteSource = path.resolve(aiConfig.neoRootDir, normalizedSource);
            if (!absoluteSource.startsWith(path.resolve(aiConfig.neoRootDir)) || !await fs.pathExists(absoluteSource)) {
                return;
            }

            const existing = candidateMap.get(normalizedSource) || {
                source : normalizedSource,
                type   : this.inferSourceType(normalizedSource),
                name   : path.basename(normalizedSource),
                reasons: [],
                score  : 0
            };

            if (!existing.reasons.includes(reason)) {
                existing.reasons.push(reason);
            }

            existing.score += score;
            candidateMap.set(normalizedSource, existing);
        };

        await this.addGuideTitleRescues({addCandidate, queryLower, queryWords});
        await this.addPathHintRescues({addCandidate, query});
        await this.addFilenameHintRescues({addCandidate, query});
        await this.addCodeTermRescues({addCandidate, query, type});

        return Array.from(candidateMap.values());
    }

    /**
     * @summary Rescues guide files whose `learn/tree.json` title is explicitly named.
     * @param {Object} options
     * @returns {Promise<void>}
     */
    async addGuideTitleRescues({addCandidate, queryLower, queryWords}) {
        const learnTreePath = path.resolve(aiConfig.neoRootDir, aiConfig.sourcePaths.LearningSource || 'learn/tree.json');

        if (!await fs.pathExists(learnTreePath)) {
            return;
        }

        const learnBaseRelative = path.dirname(aiConfig.sourcePaths.LearningSource || 'learn/tree.json');
        const learnTree         = await fs.readJson(learnTreePath);
        const queryWordSet      = new Set(queryWords);

        for (const item of learnTree.data || []) {
            if (!item.id || item.isLeaf === false) {
                continue;
            }

            const titleWords = this.getQueryWords((item.name || '').toLowerCase())
                .filter(word => !['and', 'the', 'with'].includes(word));
            const titleHits = titleWords.filter(word => queryWordSet.has(word));

            if (titleWords.length < 2 || titleHits.length < Math.min(2, titleWords.length)) {
                continue;
            }

            const source = this.normalizeSourcePath(path.join(learnBaseRelative, `${item.id}.md`));
            await addCandidate(source, `guide-title:${item.name}`, queryScoreWeights.guideMatch);
        }
    }

    /**
     * @summary Rescues explicit path and directory hints named in the query.
     * @param {Object} options
     * @returns {Promise<void>}
     */
    async addPathHintRescues({addCandidate, query}) {
        const pathHints = this.extractPathHints(query);

        for (const hint of pathHints) {
            const absolutePath = path.resolve(aiConfig.neoRootDir, hint);

            if (!absolutePath.startsWith(path.resolve(aiConfig.neoRootDir)) || !await fs.pathExists(absolutePath)) {
                continue;
            }

            const stat = await fs.stat(absolutePath);
            if (stat.isFile()) {
                await addCandidate(hint, `path:${hint}`, queryScoreWeights.sourcePathMatch);
            } else if (stat.isDirectory()) {
                const files = await this.collectFiles(absolutePath, {limit: 12});
                for (const file of files) {
                    await addCandidate(path.relative(aiConfig.neoRootDir, file), `path-dir:${hint}`, queryScoreWeights.sourcePathMatch);
                }
            }
        }
    }

    /**
     * @summary Rescues exact file basename hints when the query names a file without its full path.
     * @param {Object} options
     * @returns {Promise<void>}
     */
    async addFilenameHintRescues({addCandidate, query}) {
        const fileNames = this.extractFilenameHints(query);

        for (const fileName of fileNames) {
            const files = await this.findFilesByBasename(path.resolve(aiConfig.neoRootDir), fileName, {limit: 6});
            for (const file of files) {
                await addCandidate(path.relative(aiConfig.neoRootDir, file), `filename:${fileName}`, queryScoreWeights.fileNameMatch * 20);
            }
        }
    }

    /**
     * @summary Rescues local source files containing high-specificity code terms from the query.
     * @param {Object} options
     * @returns {Promise<void>}
     */
    async addCodeTermRescues({addCandidate, query, type}) {
        const terms = this.extractCodeTerms(query);

        if (terms.length === 0 || (type && !['all', 'src', 'raw'].includes(type))) {
            return;
        }

        const index = await this.getCodeTermRescueIndex();

        for (const entry of index) {
            if (terms.some(term => entry.compact.includes(term))) {
                await addCandidate(entry.source, 'code-term', queryScoreWeights.classNameMatch);
            }
        }
    }

    /**
     * @summary Returns the cached local source index for code-term lexical rescues.
     *
     * Code-term queries are common for Agent OS concepts (`mutate_frontier`,
     * `query_recent_turns`, `golden_path`). Building the compact source index once per
     * service lifetime keeps exact-anchor rescue behavior while avoiding a full
     * filesystem walk + file-content read on every query.
     *
     * @returns {Promise<Array<{source: String, compact: String}>>} Cached source index.
     */
    async getCodeTermRescueIndex() {
        if (this.codeTermRescueIndex) {
            return this.codeTermRescueIndex;
        }

        if (!this.codeTermRescueIndexPromise) {
            this.codeTermRescueIndexPromise = this.buildCodeTermRescueIndex()
                .then(index => {
                    this.codeTermRescueIndex = index;
                    return index;
                })
                .finally(() => {
                    this.codeTermRescueIndexPromise = null;
                });
        }

        return this.codeTermRescueIndexPromise;
    }

    /**
     * @summary Builds the compact local source index consumed by code-term lexical rescue.
     * @returns {Promise<Array<{source: String, compact: String}>>} Source index entries.
     */
    async buildCodeTermRescueIndex() {
        const entries = [];
        const roots   = codeTermRescueRoots.map(root => path.resolve(aiConfig.neoRootDir, root));

        for (const root of roots) {
            if (!await fs.pathExists(root)) {
                continue;
            }

            const files = await this.collectFiles(root, {limit: codeTermRescueFileLimit});
            for (const file of files) {
                const content = await fs.readFile(file, 'utf-8').catch(() => '');
                const compact = this.normalizeLexicalValue(content);

                if (compact) {
                    entries.push({
                        source: this.normalizeSourcePath(path.relative(aiConfig.neoRootDir, file)),
                        compact
                    });
                }
            }
        }

        return entries;
    }

    /**
     * @summary Clears the code-term rescue index so tests or future content-refresh hooks can rebuild it.
     * @returns {void}
     */
    clearCodeTermRescueIndex() {
        this.codeTermRescueIndex        = null;
        this.codeTermRescueIndexPromise = null;
    }

    /**
     * @summary Extracts path-like query anchors.
     * @param {String} query Query string.
     * @returns {String[]} Normalized path hints.
     */
    extractPathHints(query) {
        const matches = query.match(/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+/g) || [];

        return [...new Set(matches.map(match => this.normalizeSourcePath(match)))];
    }

    /**
     * @summary Extracts exact file-name query anchors.
     * @param {String} query Query string.
     * @returns {String[]} File-name hints.
     */
    extractFilenameHints(query) {
        const matches = query.match(/[a-zA-Z0-9_.-]+\.(?:js|json|md|mjs|ya?ml)/g) || [];

        return [...new Set(matches.map(match => path.basename(match)))];
    }

    /**
     * @summary Extracts code-ish identifiers such as `mutate_frontier` as compact lexical terms.
     * @param {String} query Query string.
     * @returns {String[]} Normalized code terms.
     */
    extractCodeTerms(query) {
        const matches = query.match(/[a-zA-Z][a-zA-Z0-9]*(?:[_-][a-zA-Z0-9]+)+/g) || [];

        return [...new Set(matches
            .filter(match => !query.toLowerCase().includes(`${match.toLowerCase()}.`))
            .map(match => this.normalizeLexicalValue(match))
            .filter(term => term.length > 5))];
    }

    /**
     * @summary Infers the public KB type for a local source path.
     * @param {String} source Source path relative to `neoRootDir`.
     * @returns {String} Best-effort content type.
     */
    inferSourceType(source) {
        if (source.startsWith('learn/')) return 'guide';
        if (source.startsWith('.agents/skills/')) return 'skill';
        if (source.startsWith('test/')) return 'test';
        if (source.startsWith('resources/content/issues/') || source.startsWith('resources/content/archive/issues/')) return 'ticket';
        if (source.startsWith('resources/content/discussions/') || source.startsWith('resources/content/archive/discussions/')) return 'discussion';
        if (source.startsWith('resources/content/pulls/') || source.startsWith('resources/content/archive/pulls/')) return 'pull-request';
        if (source.startsWith('resources/content/release-notes/') || source.startsWith('.github/RELEASE_NOTES/')) return 'release';

        const apiSourceMap = aiConfig.sourcePaths.ApiSource || {};
        const match = Object.entries(apiSourceMap).find(([sourceRoot]) =>
            source === sourceRoot || source.startsWith(`${sourceRoot}/`)
        );

        return match ? match[1] : 'raw';
    }

    /**
     * @summary Recursively collects local text source files below a directory.
     * @param {String} directoryPath Absolute directory path.
     * @param {Object} options
     * @param {Number} options.limit Maximum files to return.
     * @returns {Promise<String[]>} Absolute file paths.
     */
    async collectFiles(directoryPath, {limit}) {
        const files = [];
        const visit = async currentPath => {
            if (files.length >= limit) {
                return;
            }

            const entries = await fs.readdir(currentPath, {withFileTypes: true}).catch(() => []);
            entries.sort((a, b) => a.name.localeCompare(b.name));

            for (const entry of entries) {
                if (files.length >= limit) {
                    return;
                }

                const absolute = path.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    if (!lexicalRescueSkipDirs.has(entry.name)) {
                        await visit(absolute);
                    }
                } else if (await this.isReadableSourceFile(absolute, entry)) {
                    files.push(absolute);
                }
            }
        };

        await visit(directoryPath);
        return files;
    }

    /**
     * @summary Finds local files by basename while skipping generated and heavy directories.
     * @param {String} directoryPath Absolute directory path.
     * @param {String} basename File basename to match.
     * @param {Object} options
     * @param {Number} options.limit Maximum matches.
     * @returns {Promise<String[]>} Absolute file paths.
     */
    async findFilesByBasename(directoryPath, basename, {limit}) {
        const files = [];
        const visit = async currentPath => {
            if (files.length >= limit) {
                return;
            }

            const entries = await fs.readdir(currentPath, {withFileTypes: true}).catch(() => []);
            entries.sort((a, b) => a.name.localeCompare(b.name));

            for (const entry of entries) {
                if (files.length >= limit) {
                    return;
                }

                const absolute = path.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    if (!lexicalRescueSkipDirs.has(entry.name)) {
                        await visit(absolute);
                    }
                } else if (entry.name === basename && await this.isReadableSourceFile(absolute, entry)) {
                    files.push(absolute);
                }
            }
        };

        await visit(directoryPath);
        return files;
    }

    /**
     * @summary Normalizes local source paths to repo-relative POSIX form.
     * @param {String} source Source path.
     * @returns {String} Normalized source path.
     */
    normalizeSourcePath(source) {
        return (source || '').replaceAll('\\', '/').replace(/^\.?\//, '');
    }

    /**
     * @summary Returns true for readable text files, including repo symlinks to files.
     * @param {String} absolute Absolute candidate path.
     * @param {fs.Dirent} entry Directory entry.
     * @returns {Promise<Boolean>} True when the candidate is a supported file.
     */
    async isReadableSourceFile(absolute, entry) {
        if (!lexicalRescueExtensions.has(path.extname(entry.name).toLowerCase())) {
            return false;
        }

        if (entry.isFile()) {
            return true;
        }

        if (!entry.isSymbolicLink()) {
            return false;
        }

        return Boolean((await fs.stat(absolute).catch(() => null))?.isFile());
    }

    /**
     * @summary Normalizes arbitrary content for exact code-term matching.
     * @param {String} value Input value.
     * @returns {String} Compact lexical value.
     */
    normalizeLexicalValue(value = '') {
        return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
    }
}

export default Neo.setupClass(QueryService);
