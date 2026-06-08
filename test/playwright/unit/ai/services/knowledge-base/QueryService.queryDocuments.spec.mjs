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
    let originalEmbedText;
    let originalGetKnowledgeBaseCollection;

    test.beforeAll(async () => {
        ChromaManager        = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        QueryService         = (await import('../../../../../../ai/services/knowledge-base/QueryService.mjs')).default;
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;

        originalEmbedText                  = TextEmbeddingService.embedText;
        originalGetKnowledgeBaseCollection = ChromaManager.getKnowledgeBaseCollection;
    });

    test.afterEach(() => {
        TextEmbeddingService.embedText        = originalEmbedText;
        ChromaManager.getKnowledgeBaseCollection = originalGetKnowledgeBaseCollection;
    });

    function installQueryStub(metadatas, capture) {
        TextEmbeddingService.embedText = async () => [0.1, 0.2, 0.3];

        ChromaManager.getKnowledgeBaseCollection = async () => ({
            query: async options => {
                capture.options = options;

                return {
                    metadatas: [metadatas]
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

        expect(capture.options.queryEmbeddings).toEqual([[0.1, 0.2, 0.3]]);
        expect(capture.options.where).toEqual({type: 'guide'});
        expect(result.topResult).toBe('learn/guides/testing/UnitTesting.md');
        expect(result.results).toHaveLength(1);
    });

    test('omits where when type is all', async () => {
        const capture = {};
        installQueryStub([{
            source          : 'src/component/Base.mjs',
            type            : 'src',
            name            : 'Neo.component.Base',
            className       : 'Neo.component.Base',
            inheritanceChain: '[]'
        }], capture);

        await QueryService.queryDocuments({
            query: 'component base',
            type : 'all',
            limit: 5
        });

        expect(Object.hasOwn(capture.options, 'where')).toBe(false);
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
            limit: 15,
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
