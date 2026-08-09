import {setup} from '../../../../setup.mjs';

const appName = 'KBQueryServiceDocumentsTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

test.describe.configure({mode: 'serial'});

test.describe('Neo.ai.services.knowledge-base.QueryService#queryDocuments', () => {
    let ChromaManager;
    let QueryService;
    let TextEmbeddingService;
    let originalBuildCodeTermRescueIndex;
    let originalCollectFiles;
    let originalEmbedText;
    let originalFindFilesByBasename;
    let originalGetKnowledgeBaseCollection;
    let originalPathExists;

    test.beforeAll(async () => {
        ChromaManager        = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        QueryService         = (await import('../../../../../../ai/services/knowledge-base/QueryService.mjs')).default;
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;

        originalBuildCodeTermRescueIndex   = QueryService.buildCodeTermRescueIndex;
        originalCollectFiles              = QueryService.collectFiles;
        originalEmbedText                  = TextEmbeddingService.embedText;
        originalFindFilesByBasename        = QueryService.findFilesByBasename;
        originalGetKnowledgeBaseCollection = ChromaManager.getKnowledgeBaseCollection;
        originalPathExists                 = fs.pathExists;
    });

    test.afterEach(() => {
        QueryService.buildCodeTermRescueIndex    = originalBuildCodeTermRescueIndex;
        QueryService.collectFiles              = originalCollectFiles;
        QueryService.findFilesByBasename       = originalFindFilesByBasename;
        QueryService.clearCodeTermRescueIndex();
        TextEmbeddingService.embedText           = originalEmbedText;
        ChromaManager.getKnowledgeBaseCollection = originalGetKnowledgeBaseCollection;
        fs.pathExists                            = originalPathExists;
    });

    function installQueryStub(metadatasOrFactory, capture) {
        capture.options        = [];
        capture.embeddingCalls = [];
        TextEmbeddingService.embedText = async (...args) => {
            capture.embeddingCalls.push(args);
            return [0.1, 0.2, 0.3];
        };

        ChromaManager.getKnowledgeBaseCollection = async () => ({
            query: async options => {
                capture.options.push(options);
                const metadatas = typeof metadatasOrFactory === 'function'
                    ? metadatasOrFactory(options)
                    : metadatasOrFactory;

                return {
                    metadatas: [metadatas || []]
                };
            }
        });
    }

    test('requires a query string before calling embedding or Chroma services', async () => {
        await expect(QueryService.queryDocuments({query: ''}))
            .rejects.toThrow('A query string must be provided.');
    });

    test('passes a type where-clause to Chroma for typed searches', async () => {
        const capture = {};
        installQueryStub([{
            source          : 'learn/guides/testing/UnitTesting.md',
            type            : 'guide',
            name            : 'UnitTesting',
            inheritanceChain: '[]'
        }], capture);

        const result = await QueryService.queryDocuments({
            query: 'unit testing',
            type : 'guide',
            limit: 5
        });

        expect(capture.options[0].queryEmbeddings).toEqual([[0.1, 0.2, 0.3]]);
        expect(capture.options[0].where).toEqual({type: 'guide'});
        expect(capture.embeddingCalls[0][2]).toMatchObject({
            operationStage: 'kb-query-embedding',
            service       : 'knowledge-base'
        });
        expect(result.topResult).toBe('learn/guides/testing/UnitTesting.md');
        expect(result.results).toHaveLength(1);
    });

    test('findDocBySource reapplies the caller type filter — a type:guide walk never widens to a src doc (#15071 cycle-2)', async () => {
        // findDocBySource uses collection.get (by-source, no embedding); capture the where clause it builds
        let capturedWhere = null;
        ChromaManager.getKnowledgeBaseCollection = async () => ({
            get: async ({where}) => {
                capturedWhere = where;
                return {metadatas: [{source: 'src/whatever.mjs', type: 'src'}]}
            }
        });

        await QueryService.findDocBySource('learn/guides/testing/UnitTesting.md', 'guide');

        // The caller's type predicate MUST cross into the walk-hydration where — else the opt-in walk
        // widens the type scope past what ask() requested (Emmy's cycle-2 probe: ask({type:'guide'})
        // admitted a src doc). Before the fix, findDocBySource hardcoded typeFilter:null → no type clause.
        const whereJson = JSON.stringify(capturedWhere);
        expect(whereJson).toContain('"type"');
        expect(whereJson).toContain('guide');
    });

    test('stratifies broad searches into source-first candidate pools (#12719)', async () => {
        const capture = {};
        installQueryStub(options => {
            const types = options.where?.type?.$in || [];

            if (types.includes('ai-infrastructure')) {
                return [{
                    source          : 'ai/services/knowledge-base/QueryService.mjs',
                    type            : 'ai-infrastructure',
                    name            : 'Neo.ai.services.knowledge-base.QueryService',
                    className       : 'Neo.ai.services.knowledge-base.QueryService',
                    inheritanceChain: '[]'
                }];
            }

            if (types.includes('pull')) {
                return [{
                    source          : 'resources/content/pulls/chunk-1/pr-12703.md',
                    type            : 'pull',
                    name            : 'pr-12703',
                    inheritanceChain: '[]'
                }];
            }

            return [];
        }, capture);

        const result = await QueryService.queryDocuments({
            query: 'query service scorer',
            type : 'all',
            limit: 5
        });

        expect(capture.options).toHaveLength(4);
        expect(capture.options[0].nResults).toBeGreaterThan(capture.options[2].nResults);
        expect(capture.options[0].where).toEqual({type: {$in: ['src', 'ai-infrastructure', 'guide', 'concept', 'skill', 'adr']}});
        expect(capture.options[2].where).toEqual({type: {$in: ['ticket', 'pull', 'discussion', 'release', 'blog']}});
        expect(capture.options[3].where).toBeUndefined();
        expect(result.topResult).toBe('ai/services/knowledge-base/QueryService.mjs');
        expect(result.results.map(item => item.source)).toContain('resources/content/pulls/chunk-1/pr-12703.md');
    });

    test('keeps a bounded broad-search fallback for custom parser chunk kinds (#12719)', async () => {
        const capture = {};
        installQueryStub(options => {
            if (!options.where) {
                return [{
                    source          : 'src/MainView.mjs',
                    type            : 'module-context',
                    name            : 'MiniNeo.MainView',
                    className       : 'MiniNeo.MainView',
                    tenantId        : 'tenant-alpha',
                    repoSlug        : 'mini-neo-workspace',
                    content         : 'alpha-exclusive-query neo workspace panel',
                    inheritanceChain: '[]'
                }];
            }

            return [];
        }, capture);

        const result = await QueryService.queryDocuments({
            query: 'alpha-exclusive-query',
            type : 'all',
            limit: 5
        });

        expect(capture.options).toHaveLength(4);
        expect(capture.options[3]).toMatchObject({
            nResults: 5
        });
        expect(result.topResult).toBe('src/MainView.mjs');
        expect(result.results[0].metadata).toBeUndefined();
    });

    test('deduplicates candidates returned by overlapping broad-search pools (#12719)', async () => {
        const capture   = {};
        const duplicate = {
            source          : 'learn/agentos/KnowledgeBase.md',
            type            : 'guide',
            name            : 'The Knowledge Base Server',
            content         : 'duplicate candidate',
            inheritanceChain: '[]'
        };

        installQueryStub(options => {
            const types = options.where?.type?.$in || [];

            return types.includes('guide') || !options.where ? [duplicate] : [];
        }, capture);

        const result = await QueryService.queryDocuments({
            query          : 'knowledge base',
            type           : 'all',
            includeMetadata: true
        });

        expect(capture.options).toHaveLength(4);
        expect(result.results.filter(item => item.source === duplicate.source)).toHaveLength(1);
    });

    test('expands source searches to include Agent OS implementation chunks (#12719)', async () => {
        const capture = {};
        installQueryStub([{
            source          : 'ai/services/knowledge-base/QueryService.mjs',
            type            : 'ai-infrastructure',
            name            : 'Neo.ai.services.knowledge-base.QueryService',
            className       : 'Neo.ai.services.knowledge-base.QueryService',
            inheritanceChain: '[]'
        }], capture);

        await QueryService.queryDocuments({
            query: 'query service',
            type : 'src',
            limit: 5
        });

        expect(capture.options).toHaveLength(1);
        expect(capture.options[0].where).toEqual({type: {$in: ['src', 'ai-infrastructure']}});
    });

    test('returns the no-results message when Chroma returns an empty metadata payload', async () => {
        const capture = {};
        installQueryStub([], capture);

        await expect(QueryService.queryDocuments({query: 'missing', type: 'all'}))
            .resolves.toEqual({message: 'No results found for your query and type.'});
    });

    test('boosts inheritance parent sources into the ranked result set', async () => {
        const capture = {};
        installQueryStub([{
            source          : 'src/button/Base.mjs',
            type            : 'src',
            name            : 'Neo.button.Base',
            className       : 'Neo.button.Base',
            inheritanceChain: JSON.stringify([{source: 'src/component/Base.mjs'}])
        }], capture);

        const result = await QueryService.queryDocuments({
            query: 'button component',
            type : 'src',
            limit: 5
        });

        expect(result.results.map(item => item.source)).toContain('src/button/Base.mjs');
        expect(result.results.map(item => item.source)).toContain('src/component/Base.mjs');
    });

    test('returns ranked metadata only when internal hydration callers request it', async () => {
        const capture = {};
        installQueryStub([{
            source          : 'tenant-app/src/Foo.mjs',
            type            : 'src',
            name            : 'Foo',
            className       : 'Foo',
            content         : 'TENANT_METADATA_CONTENT',
            repoSlug        : 'tenant-app',
            tenantId        : 'tenant-a',
            inheritanceChain: '[]'
        }], capture);

        const publicResult = await QueryService.queryDocuments({
            query: 'foo',
            type : 'src',
            limit: 5
        });

        expect(publicResult.results[0]).not.toHaveProperty('metadata');

        const internalResult = await QueryService.queryDocuments({
            query          : 'foo',
            type           : 'src',
            limit          : 5,
            includeMetadata: true
        });

        expect(internalResult.results[0].metadata).toMatchObject({
            content : 'TENANT_METADATA_CONTENT',
            repoSlug: 'tenant-app',
            tenantId: 'tenant-a'
        });
    });

    test('does not build the code-term rescue index for no-anchor semantic queries (#12715)', async () => {
        const capture    = {};
        let   indexBuilt = false;
        installQueryStub([{
            source          : 'learn/agentos/MemoryCore.md',
            type            : 'guide',
            name            : 'Memory Core',
            inheritanceChain: '[]'
        }], capture);

        QueryService.buildCodeTermRescueIndex = async () => {
            indexBuilt = true;
            return [];
        };

        const result = await QueryService.queryDocuments({
            query: 'memory core context recovery overview',
            type : 'all',
            limit: 5
        });

        expect(result.topResult).toBe('learn/agentos/MemoryCore.md');
        expect(indexBuilt).toBe(false);
    });

    test('does not build the code-term rescue index for non-code typed searches (#12715)', async () => {
        const capture    = {};
        let   indexBuilt = false;
        installQueryStub([{
            source          : 'learn/agentos/DreamPipeline.md',
            type            : 'guide',
            name            : 'The Dream Pipeline & Golden Path',
            inheritanceChain: '[]'
        }], capture);

        QueryService.buildCodeTermRescueIndex = async () => {
            indexBuilt = true;
            return [];
        };

        const result = await QueryService.queryDocuments({
            query: 'mutate_frontier guidance',
            type : 'guide',
            limit: 5
        });

        expect(result.topResult).toBe('learn/agentos/DreamPipeline.md');
        expect(indexBuilt).toBe(false);
    });

    test('reuses the code-term rescue index across code-term queries (#12715)', async () => {
        let   indexBuilds    = 0;
        const rescuedSources = [];

        QueryService.buildCodeTermRescueIndex = async () => {
            indexBuilds++;

            return [{
                source : 'ai/services/memory-core/GraphService.mjs',
                compact: 'exportfunctionmutatefrontierqueryrecentturns'
            }];
        };

        const addCandidate = async source => rescuedSources.push(source);

        await QueryService.addCodeTermRescues({addCandidate, query: 'mutate_frontier'});
        await QueryService.addCodeTermRescues({addCandidate, query: 'query_recent_turns'});

        expect(indexBuilds).toBe(1);
        expect(rescuedSources).toEqual([
            'ai/services/memory-core/GraphService.mjs',
            'ai/services/memory-core/GraphService.mjs'
        ]);
    });

    test('rescues exact local Brain graph anchors independently of graph-dir growth (#12703, #15317)', async () => {
        const
            capture        = {},
            semanticMisses = [{
                source          : 'learn/agentos/tooling/MemoryCoreMcpApi.md',
                type            : 'guide',
                name            : 'Memory Core MCP API',
                inheritanceChain: '[]'
            }, {
                source          : 'learn/agentos/KnowledgeBase.md',
                type            : 'guide',
                name            : 'The Knowledge Base Server',
                inheritanceChain: '[]'
            }],
            query          = 'ai/services/graph GraphService.mjs',
            graphRoot      = path.resolve('ai/services/graph'),
            anchorSource   = 'ai/services/memory-core/GraphService.mjs',
            anchorAbsolute = path.resolve(anchorSource);

        installQueryStub(semanticMisses, capture);

        for (const sameDirCount of [3, 80]) {
            const
                sameDirFiles = Array.from(
                    {length: sameDirCount},
                    (_, index) => path.resolve(`ai/services/graph/SyntheticGraph${index}.mjs`)
                ),
                syntheticPaths = new Set(sameDirFiles);

            let collectLimit;

            fs.pathExists = async candidate => syntheticPaths.has(path.resolve(candidate)) || originalPathExists(candidate);
            QueryService.collectFiles = async (root, {limit} = {}) => {
                expect(path.resolve(root)).toBe(graphRoot);
                collectLimit = limit;

                return sameDirFiles.slice(0, limit)
            };
            QueryService.findFilesByBasename = async (root, fileName, {limit} = {}) => {
                expect(path.resolve(root)).toBe(path.resolve('.'));
                expect(fileName).toBe('GraphService.mjs');

                return [anchorAbsolute].slice(0, limit)
            };

            const
                queryLower   = query.toLowerCase(),
                queryWords   = QueryService.getQueryWords(queryLower),
                rescueCorpus = await QueryService.getLexicalRescueCandidates({
                    query,
                    queryLower,
                    queryWords,
                    type: 'all'
                }),
                sameDirCorpus  = rescueCorpus.filter(candidate => candidate.source.startsWith('ai/services/graph/')),
                exactAnchor    = rescueCorpus.find(candidate => candidate.source === anchorSource),
                sourceMetadata = {},
                sourceScores   = {};

            expect(sameDirCorpus).toHaveLength(Math.min(sameDirCount, collectLimit));
            expect(exactAnchor.reasons).toContain('filename:GraphService.mjs');

            await QueryService.addLexicalRescueScores({
                query,
                queryLower,
                queryWords,
                sourceMetadata,
                sourceScores,
                type: 'all'
            });

            // The exact filename rescue must outrank a path-only same-dir candidate before the final
            // cap. This is the semantic assertion; no result budget or physical directory count
            // participates.
            expect(sourceScores[exactAnchor.source])
                .toBeGreaterThan(sourceScores[sameDirCorpus.at(-1).source]);

            const result = await QueryService.queryDocuments({
                query,
                type           : 'all',
                // Derived from the controlled corpus. Growing a physical repo directory cannot consume
                // this witness's headroom — the branch and CI merge trees therefore prove the same thing.
                limit          : semanticMisses.length + rescueCorpus.length,
                includeMetadata: true
            });
            const
                sources      = result.results.map(item => item.source),
                anchorResult = result.results.find(item => item.source === exactAnchor.source);

            expect(sources).toContain(anchorSource);
            expect(sources.filter(source => source.startsWith('ai/services/graph/')))
                .toHaveLength(sameDirCorpus.length);
            expect(anchorResult.metadata.lexicalRescueReasons)
                .toContain('filename:GraphService.mjs')
        }
    });
});
