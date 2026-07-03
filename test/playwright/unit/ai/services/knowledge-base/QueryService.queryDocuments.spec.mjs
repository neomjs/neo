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
    let originalEmbedText;
    let originalGetKnowledgeBaseCollection;

    test.beforeAll(async () => {
        ChromaManager        = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        QueryService         = (await import('../../../../../../ai/services/knowledge-base/QueryService.mjs')).default;
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;

        originalBuildCodeTermRescueIndex  = QueryService.buildCodeTermRescueIndex;
        originalEmbedText                  = TextEmbeddingService.embedText;
        originalGetKnowledgeBaseCollection = ChromaManager.getKnowledgeBaseCollection;
    });

    test.afterEach(() => {
        QueryService.buildCodeTermRescueIndex = originalBuildCodeTermRescueIndex;
        QueryService.clearCodeTermRescueIndex();
        TextEmbeddingService.embedText           = originalEmbedText;
        ChromaManager.getKnowledgeBaseCollection = originalGetKnowledgeBaseCollection;
    });

    function installQueryStub(metadatasOrFactory, capture) {
        capture.options = [];
        TextEmbeddingService.embedText = async () => [0.1, 0.2, 0.3];

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
        expect(result.topResult).toBe('learn/guides/testing/UnitTesting.md');
        expect(result.results).toHaveLength(1);
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

    test('rescues exact local Brain graph anchors when semantic top-k misses them (#12703)', async () => {
        const capture = {};
        installQueryStub([{
            source          : 'learn/agentos/tooling/MemoryCoreMcpApi.md',
            type            : 'guide',
            name            : 'Memory Core MCP API',
            inheritanceChain: '[]'
        }, {
            source          : 'learn/agentos/KnowledgeBase.md',
            type            : 'guide',
            name            : 'The Knowledge Base Server',
            inheritanceChain: '[]'
        }], capture);

        const result = await QueryService.queryDocuments({
            query: 'Neo graph database HybridRAG mutate_frontier Dream Pipeline Gemma4 31B graph processing ai/services/graph sandman_handoff.md',
            type : 'all',
            // The query path-matches the whole `ai/services/graph` dir, so the lexical rescue boosts every file in
            // it; the final list is score-sorted then capped at `limit` (QueryService L235). The semantic top-k is
            // stubbed above (the "miss" the rescue is proving it recovers from), so `limit` only sizes the final
            // rescued set — it must exceed the graph dir size + the cross-dir anchors (e.g. memory-core
            // GraphService.mjs), else simply adding a graph file evicts a boundary anchor. 25 = the production
            // default, with headroom over the current dir size.
            limit          : 25,
            includeMetadata: true
        });
        const sources = result.results.map(item => item.source);

        expect(sources).toContain('learn/agentos/DreamPipeline.md');
        expect(sources).toContain('ai/services/graph/GoldenPathSynthesizer.mjs');
        expect(sources).toContain('ai/services/memory-core/GraphService.mjs');

        if (await fs.pathExists(path.resolve('resources/content/sandman_handoff.md'))) {
            expect(sources).toContain('resources/content/sandman_handoff.md');
        }

        const dreamPipeline = result.results.find(item => item.source === 'learn/agentos/DreamPipeline.md');
        expect(dreamPipeline.metadata).toMatchObject({
            repoSlug: 'neo',
            tenantId: 'neo-shared',
            type    : 'guide'
        });
        expect(dreamPipeline.metadata.lexicalRescueReasons).toContain('guide-title:The Dream Pipeline & Golden Path');
    });
});
