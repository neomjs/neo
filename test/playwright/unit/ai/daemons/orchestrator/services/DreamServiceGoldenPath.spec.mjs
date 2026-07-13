import {setup} from '../../../../../setup.mjs';

const appName = 'DreamServiceTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

test.describe('DreamService Golden Path', () => {
    let TextEmbeddingService, aiConfig, DreamService, GraphService, OpenAiCompatible, StorageRouter, SystemLifecycleService;
    let originalEmbedText, originalGenerate;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;

        TextEmbeddingService = (await import('../../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;
        DreamService         = (await import('../../../../../../../ai/daemons/orchestrator/services/DreamService.mjs')).default;
        GraphService         = (await import('../../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        OpenAiCompatible     = (await import('../../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        StorageRouter        = (await import('../../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        // Mock TextEmbeddingService to return an array of 4096 floats for Qwen3 compatibility
        originalEmbedText = TextEmbeddingService.embedText;
        TextEmbeddingService.embedText = async () => new Array(4096).fill(0.1);
        originalGenerate = OpenAiCompatible.prototype.generate;
        OpenAiCompatible.prototype.generate = async () => ({
            content: JSON.stringify({strategic_brief: 'Bounded Dream Golden Path synthesis.'})
        });

        if (!SystemLifecycleService._initPromise) { await SystemLifecycleService.initAsync(); } else { await SystemLifecycleService.ready(); }

        // A prior spec can clear the process-lifetime graph without re-running Base's one-shot
        // readiness promise. Seed this test's required system fixture explicitly; never destroy and
        // pseudo-reinitialize the singleton merely to recover a boot-time row.
        if (!GraphService.db.nodes.has('frontier')) {
            GraphService.upsertGlobalNode({
                id         : 'frontier',
                type       : 'SYSTEM_ANCHOR',
                name       : 'Active Context Frontier',
                description: 'The shifting focal point of the active Neo OS agent session.'
            });
        }
    });

    test.afterAll(async () => {
        const fs = await import('fs');

        TextEmbeddingService.embedText       = originalEmbedText;
        OpenAiCompatible.prototype.generate = originalGenerate;
        GraphService.removeNodes(['issue-dream-golden-path-fixture']);

        if (fs.existsSync(aiConfig.handoffFilePath)) {
            try {fs.unlinkSync(aiConfig.handoffFilePath);} catch (e) {}
        }
    });

    test('synthesizeGoldenPath executes without crashing', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: synthesis-write race post-#10940 engine=hybrid fix (#10946)');
        test.setTimeout(60000);

        const originalGetGraphCollection = StorageRouter.getGraphCollection;
        let   capturedWhere              = null;

        // Seed one bounded real SQLite + Chroma candidate. Scanning and embedding the repository's
        // ever-growing live issue corpus made this synthesis test scale with backlog size; dedicated
        // IssueIngestor tests own that separate contract.
        const issueId = 'issue-dream-golden-path-fixture';

        GraphService.upsertNode({
            id        : issueId,
            type      : 'ISSUE',
            name      : 'Dream Golden Path Fixture',
            state     : 'OPEN',
            properties: {state: 'OPEN', labels: ['enhancement']}
        });

        // Keep the vector boundary hermetic. A shared Chroma collection can contain unrelated
        // ISSUE vectors and let this test pass even when the fixture is never selected.
        StorageRouter.getGraphCollection = async () => ({
            count: async () => 1,
            query: async ({where}) => {
                capturedWhere = where;

                return {
                    ids      : [[issueId]],
                    distances: [[0.1]]
                }
            }
        });

        try {
            await DreamService.synthesizeGoldenPath();
        } finally {
            StorageRouter.getGraphCollection = originalGetGraphCollection
        }

        const topology = await GraphService.getContextFrontier();
        expect(topology).not.toBeNull();
        expect(topology.frontier.id).toBe('frontier');

        const openIssues = GraphService.db.nodes.items.filter(n => (n.label === 'ISSUE' || n.type === 'ISSUE') && n.properties?.state === 'OPEN');

        expect(openIssues.map(issue => issue.id)).toContain(issueId);
        expect(capturedWhere).toEqual({type: {'$in': ['ISSUE', 'DISCUSSION']}});

        // The exact fixture must be guided; an unrelated shared-vector candidate cannot satisfy this oracle.
        const guides = topology.strategicNeighbors.filter(n => n.relationship === 'GUIDES');
        expect(guides.map(node => node.id)).toEqual([issueId]);
    });
});
