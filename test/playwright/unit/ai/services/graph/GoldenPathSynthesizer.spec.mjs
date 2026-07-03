import {setup} from '../../../../setup.mjs';

const appName = 'GoldenPathSynthesizerTest';

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

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../src/core/_export.mjs';
import fs                    from 'fs';
import path                  from 'path';
import os                    from 'os';
import child_process         from 'child_process';
import {TestLifecycleHelper} from '../../services/memory-core/util.mjs';

test.describe('Neo.ai.daemons.services.GoldenPathSynthesizer', () => {
    test.describe.configure({mode: 'serial'});

    let GoldenPathSynthesizer;
    let aiConfig;
    let logger;
    let GraphService;
    let SystemLifecycleService;
    let buildStaleAssignmentCandidates;
    let renderStaleAssignmentCandidatesSection;
    let buildSilentThreadCandidates;
    let renderSilentThreadCandidatesSection;
    let buildWorkGraphStallFindings;
    let renderWorkGraphStallFindingsSection;
    let issueFocusSections;

    let StorageRouter;
    let TextEmbeddingService;
    let tmpHandoffFile;
    let originalExecSync;
    let originalEmbeddingModel;
    let originalEmbeddingProvider;
    let originalGoldenPathRecentOpenPrRenderLimit;
    let originalGoldenPathTopNodeRenderLimit;
    let originalGoldenPathStaleAssignmentRenderLimit;
    let originalGoldenPathStaleAssignmentThresholdMs;
    let originalGoldenPathSilentThreadMinScore;
    let originalGoldenPathSilentThreadRenderLimit;
    let originalGoldenPathSilentThreadThresholdMs;
    let originalGoldenPathStallFindingRenderEnabled;
    let originalGoldenPathStallFindingRenderLimit;
    let originalVectorDimension;
    let originalWarn;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const os     = await import('os');
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        const testDbName = `memory-core-goldenpath-test-${process.pid}-${Date.now()}.sqlite`;
        const testDbPath = path.join(tmpDir, testDbName);
        aiConfig.storagePaths.graph = testDbPath;

        // Read the resolved per-worker test handoff path (a computed formula under UNIT_TEST_MODE);
        // the writer targets the same resolved path, so the read-backs match. Mutating
        // aiConfig.handoffFilePath would NOT write through the formula (a read-only computed leaf).
        tmpHandoffFile = aiConfig.handoffFilePath;

        const GoldenPathSynthesizerModule = await import('../../../../../../ai/services/graph/GoldenPathSynthesizer.mjs');
        GoldenPathSynthesizer = GoldenPathSynthesizerModule.default;
        issueFocusSections = await import('../../../../../../ai/services/graph/issueFocusSections.mjs');
        buildStaleAssignmentCandidates = GoldenPathSynthesizer.constructor.buildStaleAssignmentCandidates.bind(GoldenPathSynthesizer.constructor);
        renderStaleAssignmentCandidatesSection = GoldenPathSynthesizer.constructor.renderStaleAssignmentCandidatesSection.bind(GoldenPathSynthesizer.constructor);
        buildSilentThreadCandidates = GoldenPathSynthesizer.constructor.buildSilentThreadCandidates.bind(GoldenPathSynthesizer.constructor);
        renderSilentThreadCandidatesSection = GoldenPathSynthesizer.constructor.renderSilentThreadCandidatesSection.bind(GoldenPathSynthesizer.constructor);
        buildWorkGraphStallFindings = GoldenPathSynthesizer.constructor.buildWorkGraphStallFindings.bind(GoldenPathSynthesizer.constructor);
        renderWorkGraphStallFindingsSection = GoldenPathSynthesizer.constructor.renderWorkGraphStallFindingsSection.bind(GoldenPathSynthesizer.constructor);
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        StorageRouter = (await import('../../../../../../ai/services.mjs')).Memory_StorageRouter;
        TextEmbeddingService = (await import('../../../../../../ai/services.mjs')).Memory_TextEmbeddingService;
        logger = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;

        if (!SystemLifecycleService._initPromise) { await SystemLifecycleService.initAsync(); } else { await SystemLifecycleService.ready(); }
    });

    test.beforeEach(() => {
        originalEmbeddingModel    = aiConfig.embeddingModel;
        originalEmbeddingProvider = aiConfig.embeddingProvider;
        originalExecSync          = child_process.execSync;
        originalGoldenPathRecentOpenPrRenderLimit       = aiConfig.goldenPathRecentOpenPrRenderLimit;
        originalGoldenPathTopNodeRenderLimit            = aiConfig.goldenPathTopNodeRenderLimit;
        originalGoldenPathStaleAssignmentRenderLimit    = aiConfig.goldenPathStaleAssignmentRenderLimit;
        originalGoldenPathStaleAssignmentThresholdMs    = aiConfig.goldenPathStaleAssignmentThresholdMs;
        originalGoldenPathSilentThreadMinScore          = aiConfig.goldenPathSilentThreadMinScore;
        originalGoldenPathSilentThreadRenderLimit       = aiConfig.goldenPathSilentThreadRenderLimit;
        originalGoldenPathSilentThreadThresholdMs       = aiConfig.goldenPathSilentThreadThresholdMs;
        originalGoldenPathStallFindingRenderEnabled     = aiConfig.goldenPathStallFindingRenderEnabled;
        originalGoldenPathStallFindingRenderLimit       = aiConfig.goldenPathStallFindingRenderLimit;
        originalVectorDimension   = aiConfig.vectorDimension;
        originalWarn              = logger.warn;

        aiConfig.goldenPathRecentOpenPrRenderLimit       = 5;
        aiConfig.goldenPathTopNodeRenderLimit            = 10;
        aiConfig.goldenPathStaleAssignmentRenderLimit    = 20;
        aiConfig.goldenPathStaleAssignmentThresholdMs    = 7 * 24 * 60 * 60 * 1000;
        aiConfig.goldenPathSilentThreadMinScore          = 14;
        aiConfig.goldenPathSilentThreadRenderLimit       = 10;
        aiConfig.goldenPathSilentThreadThresholdMs       = 14 * 24 * 60 * 60 * 1000;
        aiConfig.goldenPathStallFindingRenderEnabled     = true;
        aiConfig.goldenPathStallFindingRenderLimit       = 10;
    });

    test.afterEach(() => {
        aiConfig.embeddingModel    = originalEmbeddingModel;
        aiConfig.embeddingProvider = originalEmbeddingProvider;
        aiConfig.goldenPathRecentOpenPrRenderLimit       = originalGoldenPathRecentOpenPrRenderLimit;
        aiConfig.goldenPathTopNodeRenderLimit            = originalGoldenPathTopNodeRenderLimit;
        aiConfig.goldenPathStaleAssignmentRenderLimit    = originalGoldenPathStaleAssignmentRenderLimit;
        aiConfig.goldenPathStaleAssignmentThresholdMs    = originalGoldenPathStaleAssignmentThresholdMs;
        aiConfig.goldenPathSilentThreadMinScore          = originalGoldenPathSilentThreadMinScore;
        aiConfig.goldenPathSilentThreadRenderLimit       = originalGoldenPathSilentThreadRenderLimit;
        aiConfig.goldenPathSilentThreadThresholdMs       = originalGoldenPathSilentThreadThresholdMs;
        aiConfig.goldenPathStallFindingRenderEnabled     = originalGoldenPathStallFindingRenderEnabled;
        aiConfig.goldenPathStallFindingRenderLimit       = originalGoldenPathStallFindingRenderLimit;
        aiConfig.vectorDimension   = originalVectorDimension;
        child_process.execSync     = originalExecSync;
        logger.warn                = originalWarn;

        if (fs.existsSync(tmpHandoffFile)) {
            try { fs.unlinkSync(tmpHandoffFile); } catch(e) {}
        }
    });

    test.afterAll(async () => {
        const testDbPath = aiConfig.storagePaths.graph;
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, testDbPath, fs, 'clear');
    });

    test('derives repo-enrichment identity projections from identityRoots', () => {
        const Synthesizer = GoldenPathSynthesizer.constructor;

        expect(Synthesizer.getCoreSwarmAgentFamilies()).toMatchObject({
            'neo-opus-grace': 'claude',
            'neo-gemini-pro': 'gemini',
            'neo-gpt'       : 'gpt',
            'neo-opus-ada'  : 'claude',
            'neo-opus-vega' : 'claude'
        });

        expect(Synthesizer.getAgentLogins()).toEqual(expect.arrayContaining([
            'neo-opus-grace',
            'neo-gemini-pro',
            'neo-gpt',
            'neo-opus-ada',
            'neo-opus-vega'
        ]));
        expect(Synthesizer.getAgentLogins()).not.toContain('tobiu');

        expect(Synthesizer.getStaleAssignmentMaintainers()).toEqual(expect.arrayContaining([
            'neo-opus-grace',
            'neo-gemini-pro',
            'neo-gpt',
            'neo-opus-ada',
            'neo-opus-vega',
            'tobiu'
        ]));
    });

    test('scoreCurrentFocusIssue surfaces focused epic umbrellas without routing them (#14337)', () => {
        const Synthesizer = GoldenPathSynthesizer.constructor;
        const now         = new Date('2026-06-29T12:00:00Z');
        const candidate   = issueFocusSections.scoreCurrentFocusIssue({
            meta: {
                id                : 14310,
                title             : 'Documentation & learning-experience overhaul (v13.1)',
                state             : 'OPEN',
                labels            : ['documentation', 'epic', 'ai', 'architecture'],
                createdAt         : '2026-06-29T08:46:57Z',
                updatedAt         : '2026-06-29T09:44:27Z',
                milestone         : 'v13.1',
                subIssuesCompleted: 3,
                subIssuesTotal    : 22
            },
            now
        });

        expect(candidate).toMatchObject({
            isEpic           : true,
            milestone        : 'v13.1',
            number           : 14310,
            openSubIssueCount: 19
        });
        expect(candidate.reasons).toContain('v13.1');
        expect(Synthesizer.isActionableComputedRecommendation({
            id        : 'issue-14310',
            type      : 'ISSUE',
            properties: {labels: ['epic', 'ai']}
        })).toBe(false);
        expect(issueFocusSections.scoreCurrentFocusIssue({
            meta: {
                id       : 14000,
                title    : 'Generic architecture epic',
                state    : 'OPEN',
                labels   : ['epic', 'ai', 'architecture'],
                createdAt: '2026-06-29T08:00:00Z',
                updatedAt: '2026-06-29T09:00:00Z'
            },
            now
        })).toBeNull();

        const staleSyncCandidate = issueFocusSections.scoreCurrentFocusIssue({
            meta: {
                id                : 14310,
                title             : 'Documentation & learning-experience overhaul (v13.1)',
                state             : 'OPEN',
                labels            : ['documentation', 'epic', 'ai', 'architecture'],
                createdAt         : '2026-06-29T08:46:57Z',
                updatedAt         : '2026-06-29T09:44:27Z',
                subIssuesCompleted: 0,
                subIssuesTotal    : 22
            },
            now
        });

        expect(staleSyncCandidate).toMatchObject({
            isEpic           : true,
            milestone        : undefined,
            openSubIssueCount: 22
        });
        expect(staleSyncCandidate.reasons).toContain('v13.1');
    });

    test('hasCrossFamilyReview accepts injected identity-family maps', () => {
        const Synthesizer = GoldenPathSynthesizer.constructor;
        const pr          = {
            author : {login: 'author-agent'},
            reviews: [{author: {login: 'reviewer-agent'}}]
        };

        expect(Synthesizer.hasCrossFamilyReview(pr, {
            'author-agent'  : 'gpt',
            'reviewer-agent': 'gpt'
        })).toBe(false);

        expect(Synthesizer.hasCrossFamilyReview(pr, {
            'author-agent'  : 'gpt',
            'reviewer-agent': 'claude'
        })).toBe(true);
    });

    test('getRecentSummaryDocuments returns the N most-recent summaries by timestamp, newest-first (#13800)', async () => {
        const Synthesizer = GoldenPathSynthesizer.constructor;
        const docMap      = {s1: 'doc-old', s2: 'doc-newest', s3: 'doc-mid'};
        const collection  = {
            get: async opts => {
                // metadatas pass: storage-order (s1,s2,s3) with out-of-order timestamps
                if (opts.include?.includes('metadatas') && !opts.ids) {
                    return {ids: ['s1', 's2', 's3'], metadatas: [{timestamp: 100}, {timestamp: 300}, {timestamp: 200}]};
                }
                // ids-keyed document read
                return {ids: opts.ids, documents: opts.ids.map(id => docMap[id])};
            }
        };

        const result = await Synthesizer.getRecentSummaryDocuments(collection, 2);
        // Storage-order is s1,s2,s3; recency-sorted top-2 is s2 (ts 300) then s3 (ts 200).
        expect(result.documents).toEqual(['doc-newest', 'doc-mid']);
    });

    test('getRecentSummaryDocuments returns empty documents for an empty collection (#13800)', async () => {
        const Synthesizer = GoldenPathSynthesizer.constructor;
        const collection  = {get: async () => ({ids: [], metadatas: []})};

        expect(await Synthesizer.getRecentSummaryDocuments(collection, 2)).toEqual({documents: []});
    });

    test('findLastQualifyingAssignmentActivity treats owner identity comments as maintainer progress acknowledgements', () => {
        const Synthesizer = GoldenPathSynthesizer.constructor;
        const activity    = Synthesizer.findLastQualifyingAssignmentActivity({
            assignees: ['neo-gpt'],
            author   : 'neo-gpt',
            createdAt: '2026-05-01T00:00:00Z',
            content  : [
                '### @tobiu - 2026-05-27T00:00:00Z',
                '',
                'working on this'
            ].join('\n')
        });

        expect(activity.author).toBe('tobiu');
        expect(activity.createdAt.toISOString()).toBe('2026-05-27T00:00:00.000Z');
        expect(activity.reason).toBe('maintainer-progress-ack');
    });

    test('synthesizeGoldenPath appends Active PR Cycle State from GitHub CLI output', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        aiConfig.vectorDimension = 2;

        StorageRouter.getGraphCollection = async () => ({ query: async () => ({ ids: [['mock-id']], distances: [[0.1]] }) });
        StorageRouter.getSummaryCollection = async () => ({ get: async () => ({ documents: ['mock document'] }) });
        TextEmbeddingService.embedText = async () => [0.1, 0.2];

        // Mock gh pr list output
        const mockPrData = [
            {
                number        : 11178,
                url           : "https://github.com/neomjs/neo/pull/11178",
                author        : { login: "neo-gemini-pro" },
                title         : "feat(ai): Automate PR Cycle State Extraction",
                body          : "lane-state: AWAITING_REVIEW\nCycle 2",
                createdAt     : "2026-05-11T00:00:00Z",
                headRefOid    : "abcdef1234567890",
                reviewRequests: [{ login: "neo-opus-ada" }],
                reviews       : [
                    { state: "CHANGES_REQUESTED", body: "Needs more scope reduction.", submittedAt: "2026-05-11T00:00:00Z", author: {login: "neo-opus-ada"} }
                ],
                comments: []
            }
        ];

        const originalFetchOpenPRs = GoldenPathSynthesizer.fetchOpenPRs;
        GoldenPathSynthesizer.fetchOpenPRs = async () => mockPrData;

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath();
        } finally {
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');

        expect(handoffContent).toContain('## Active PR Cycle State');
        expect(handoffContent).toContain('(Source: GitHub Live; Status at generation: current; Fresh until:');
        expect(handoffContent).toContain('### Recent Open PRs (`1` of `1` items)');
        expect(handoffContent).toContain('cross-family reviewed: yes');
        expect(handoffContent).toContain('- **PR #11178**: feat(ai): Automate PR Cycle State Extraction');
        expect(handoffContent).not.toContain('](https://github.com/');
        expect(handoffContent).not.toContain('### @neo-gemini-pro');
        expect(handoffContent).not.toContain('- **Lane State**:');
        expect(handoffContent).not.toContain('- **Cycle**:');
        expect(handoffContent).not.toContain('- **Reviewers**:');
        expect(handoffContent).not.toContain('- **Status**:');
        expect(handoffContent).not.toContain('- **Head SHA**:');
    });

    test('synthesizeGoldenPath overwrites stale author sections when semantic candidates are empty', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const issuesDir                    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-zero-candidate-issues-'));
        aiConfig.vectorDimension = 2;

        fs.mkdirSync(path.dirname(tmpHandoffFile), {recursive: true});
        fs.writeFileSync(tmpHandoffFile, [
            '# Autonomous Handoff (Dream Pipeline & Golden Path)',
            '',
            '## Active PR Cycle State',
            '',
            '### Recent Open PRs',
            '',
            '### @neo-gpt',
            '',
            '- stale author-grouped PR entry',
            '',
            '### @neo-opus-grace',
            '',
            '- stale author-grouped PR entry'
        ].join('\n'));

        StorageRouter.getGraphCollection = async () => ({ query: async () => ({ ids: [[]], distances: [[]] }) });
        StorageRouter.getSummaryCollection = async () => ({ get: async () => ({ documents: ['mock document'] }) });
        TextEmbeddingService.embedText = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => [
            {
                number        : 13962,
                url           : 'https://github.com/neomjs/neo/pull/13962',
                author        : {login: 'neo-gpt'},
                title         : 'fix(ai): overwrite stale Sandman handoff',
                body          : '',
                createdAt     : '2026-06-24T17:59:52Z',
                headRefOid    : 'abcdef1234567890',
                reviewRequests: [],
                reviews       : [],
                comments      : []
            }
        ];

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({issuesDir});
        } finally {
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            fs.rmSync(issuesDir, {recursive: true, force: true});
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');

        expect(handoffContent).toContain('## Active PR Cycle State');
        expect(handoffContent).toContain('### Recent Open PRs (`1` of `1` items)');
        expect(handoffContent).toContain('## Computed Golden Path (Strategic Recommendation)');
        expect(handoffContent).toContain('No actionable computed recommendations survived the current Tri-Vector filter pass.');
        expect(handoffContent).toContain('- Semantic candidates: 0');
        expect(handoffContent).not.toContain('### @neo-gpt');
        expect(handoffContent).not.toContain('### @neo-opus-grace');
        expect(handoffContent).not.toContain('stale author-grouped PR entry');
    });

    test('synthesizeGoldenPath renders degraded Active PR Cycle State when GitHub PR fetch fails (#13985)', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const issuesDir                    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-degraded-pr-issues-'));
        const now                          = new Date('2026-06-25T02:00:00.000Z');
        aiConfig.vectorDimension = 2;

        fs.mkdirSync(path.dirname(tmpHandoffFile), {recursive: true});
        fs.writeFileSync(tmpHandoffFile, [
            '# Autonomous Handoff (Dream Pipeline & Golden Path)',
            '',
            '## Active PR Cycle State',
            '',
            '*Captured at: 2026-06-22T12:48:16.738Z (Source: GitHub Live)*',
            '',
            '### Recent Open PRs',
            '',
            '- **PR #13864**: stale lifecycle data',
            '',
            '### @neo-gpt',
            '',
            '- stale author-grouped PR entry'
        ].join('\n'));

        StorageRouter.getGraphCollection = async () => ({ query: async () => ({ ids: [[]], distances: [[]] }) });
        StorageRouter.getSummaryCollection = async () => ({ get: async () => ({ documents: ['mock document'] }) });
        TextEmbeddingService.embedText = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => {
            throw new Error('gh pr list unavailable');
        };

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({issuesDir, now});
        } finally {
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            fs.rmSync(issuesDir, {recursive: true, force: true});
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');

        expect(handoffContent).toContain('## Active PR Cycle State');
        expect(handoffContent).toContain('*Captured at: 2026-06-25T02:00:00.000Z (Source: GitHub Live; Status at generation: degraded; Fresh until: 2026-06-25T03:00:00.000Z)*');
        expect(handoffContent).toContain('### Recent Open PRs (degraded)');
        expect(handoffContent).toContain('Live PR fetch failed; stale PR data was intentionally not reused.');
        expect(handoffContent).toContain('- Error: gh pr list unavailable');
        expect(handoffContent).not.toContain('PR #13864');
        expect(handoffContent).not.toContain('### @neo-gpt');
        expect(handoffContent).not.toContain('stale author-grouped PR entry');
    });

    test('renderActivePrCycleState marks snapshots older than the configured SLA as stale (#13985)', () => {
        const section = GoldenPathSynthesizer.constructor.renderActivePrCycleState({
            capturedAt : new Date('2026-06-25T00:00:00.000Z'),
            freshnessMs: 60 * 60 * 1000,
            now        : new Date('2026-06-25T02:00:00.000Z'),
            prs        : []
        });

        expect(section).toContain('*Captured at: 2026-06-25T00:00:00.000Z (Source: GitHub Live; Status at generation: stale; Fresh until: 2026-06-25T01:00:00.000Z)*');
        expect(section).toContain('### Recent Open PRs (`0` of `0` items)');
    });

    test('synthesizeGoldenPath skips Neo repo enrichment sections when deployment config disables them', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const issuesDir                    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-recent-pr-issues-'));
        aiConfig.vectorDimension = 2;

        StorageRouter.getGraphCollection = async () => ({ query: async () => ({ ids: [['mock-id']], distances: [[0.1]] }) });
        StorageRouter.getSummaryCollection = async () => ({ get: async () => ({ documents: ['mock document'] }) });
        TextEmbeddingService.embedText = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => {
            throw new Error('fetchOpenPRs should not run when repo enrichment is disabled');
        };

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});
        } finally {
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');

        expect(handoffContent).not.toContain('## Active PR Cycle State');
        expect(handoffContent).not.toContain('## Stale Assignment Candidates');
        expect(handoffContent).not.toContain('## Silent Threads');
        expect(handoffContent).not.toContain('## 📋 Latest Priority Backlog');
    });

    test('synthesizeGoldenPath renders stale assignment candidates from local issue sync', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const issuesDir                    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-stale-issues-'));
        const chunkDir                     = path.join(issuesDir, 'chunk-1');
        const now                          = new Date('2026-05-28T00:00:00Z');
        aiConfig.vectorDimension = 2;

        fs.mkdirSync(chunkDir, {recursive: true});
        fs.writeFileSync(path.join(chunkDir, 'issue-9001.md'), [
            '---',
            'id: 9001',
            "title: 'Old assigned issue'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees:',
            '  - neo-opus-ada',
            "createdAt: '2026-05-01T00:00:00Z'",
            "updatedAt: '2026-05-10T00:00:00Z'",
            "githubUrl: 'https://github.com/neomjs/neo/issues/9001'",
            'author: neo-opus-ada',
            '---',
            '# Old assigned issue',
            '',
            '## Timeline',
            '',
            '- 2026-05-01T00:00:00Z @tobiu assigned to @neo-opus-ada',
            '### @neo-opus-ada - 2026-05-10T00:00:00Z',
            '',
            'working on this'
        ].join('\n'));
        fs.writeFileSync(path.join(chunkDir, 'issue-9002.md'), [
            '---',
            'id: 9002',
            "title: 'Fresh assigned issue'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees:',
            '  - neo-gpt',
            "createdAt: '2026-05-01T00:00:00Z'",
            "updatedAt: '2026-05-27T00:00:00Z'",
            "githubUrl: 'https://github.com/neomjs/neo/issues/9002'",
            'author: neo-gpt',
            '---',
            '# Fresh assigned issue',
            '',
            '## Timeline',
            '',
            '### @neo-gpt - 2026-05-27T00:00:00Z',
            '',
            'still in progress'
        ].join('\n'));
        fs.writeFileSync(path.join(chunkDir, 'issue-9003.md'), [
            '---',
            'id: 9003',
            "title: 'Rejected assigned issue'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            '  - needs-re-triage',
            'assignees:',
            '  - neo-gpt',
            "createdAt: '2026-05-01T00:00:00Z'",
            "updatedAt: '2026-05-01T00:00:00Z'",
            "githubUrl: 'https://github.com/neomjs/neo/issues/9003'",
            'author: neo-gpt',
            '---',
            '# Rejected assigned issue'
        ].join('\n'));

        StorageRouter.getGraphCollection = async () => ({ query: async () => ({ ids: [['mock-id']], distances: [[0.1]] }) });
        StorageRouter.getSummaryCollection = async () => ({ get: async () => ({ documents: ['mock document'] }) });
        TextEmbeddingService.embedText = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => [];

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({issuesDir, now});
        } finally {
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            fs.rmSync(issuesDir, {recursive: true, force: true});
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');

        expect(handoffContent).toContain('## Stale Assignment Candidates');
        expect(handoffContent).toContain('**#9001**');
        expect(handoffContent).not.toContain('](https://github.com/');
        expect(handoffContent).toContain('assignee @neo-opus-ada');
        expect(handoffContent).toContain('last qualifying activity 2026-05-10T00:00:00.000Z by @neo-opus-ada');
        expect(handoffContent).not.toContain('Fresh assigned issue');
        expect(handoffContent).not.toContain('Rejected assigned issue');
    });

    test('synthesizeGoldenPath renders Silent Threads after stale assignments and before computed routing', async () => {
        const originalGetGraphCollection       = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection     = StorageRouter.getSummaryCollection;
        const originalEmbedText                = TextEmbeddingService.embedText;
        const originalFetchOpenPRs             = GoldenPathSynthesizer.fetchOpenPRs;
        const OpenAiCompatible                 = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        const originalGenerate                 = OpenAiCompatible.prototype.generate;
        const Synthesizer                      = GoldenPathSynthesizer.constructor;
        const originalGetIssueStructuralWeight = Synthesizer.getIssueStructuralWeight;
        const originalHasOpenIssueBlocker      = Synthesizer.hasOpenIssueBlocker;
        const issuesDir                        = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-silent-render-issues-'));
        const chunkDir                         = path.join(issuesDir, 'chunk-1');
        const now                              = new Date('2026-05-28T00:00:00Z');
        const goldenIssueId                    = `issue-silent-golden-${Date.now()}`;
        aiConfig.vectorDimension = 2;

        fs.mkdirSync(chunkDir, {recursive: true});
        fs.writeFileSync(path.join(chunkDir, 'issue-9401.md'), [
            '---',
            'id: 9401',
            "title: 'Quiet unassigned issue'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees: []',
            "createdAt: '2026-04-01T00:00:00Z'",
            "updatedAt: '2026-05-01T00:00:00Z'",
            "githubUrl: 'https://github.com/neomjs/neo/issues/9401'",
            'author: neo-gpt',
            '---',
            '# Quiet unassigned issue'
        ].join('\n'));
        fs.writeFileSync(path.join(chunkDir, 'issue-9402.md'), [
            '---',
            'id: 9402',
            "title: 'Fresh unassigned issue'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees: []',
            "createdAt: '2026-05-27T00:00:00Z'",
            "updatedAt: '2026-05-27T00:00:00Z'",
            "githubUrl: 'https://github.com/neomjs/neo/issues/9402'",
            '---',
            '# Fresh unassigned issue'
        ].join('\n'));

        GraphService.upsertNode({
            id        : goldenIssueId,
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Golden fixture'}
        });

        StorageRouter.getGraphCollection = async () => ({ query: async () => ({ ids: [[goldenIssueId]], distances: [[0.1]] }) });
        StorageRouter.getSummaryCollection = async () => ({ get: async () => ({ documents: ['mock document'] }) });
        TextEmbeddingService.embedText = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => [];
        Synthesizer.getIssueStructuralWeight = issueId => issueId === 'issue-9401' ? 3 : 0;
        Synthesizer.hasOpenIssueBlocker = () => false;
        OpenAiCompatible.prototype.generate = async () => ({content: '{"strategic_brief":"stub"}'});

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({issuesDir, now});
        } finally {
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            OpenAiCompatible.prototype.generate = originalGenerate;
            Synthesizer.getIssueStructuralWeight = originalGetIssueStructuralWeight;
            Synthesizer.hasOpenIssueBlocker = originalHasOpenIssueBlocker;
            fs.rmSync(issuesDir, {recursive: true, force: true});
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');

        expect(handoffContent).toContain('## Stale Assignment Candidates');
        expect(handoffContent).toContain('## Silent Threads');
        expect(handoffContent).toContain('**#9401**');
        expect(handoffContent).not.toContain('](https://github.com/');
        expect(handoffContent).toContain('visibility-only, no routing');
        expect(handoffContent).not.toContain('Fresh unassigned issue');
        expect(handoffContent.indexOf('## Stale Assignment Candidates')).toBeLessThan(handoffContent.indexOf('## Silent Threads'));
        expect(handoffContent.indexOf('## Silent Threads')).toBeLessThan(handoffContent.indexOf('## Computed Golden Path'));
    });

    test('synthesizeGoldenPath scopes the candidate-pool query to ISSUE + DISCUSSION vectors', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const OpenAiCompatible             = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        const originalGenerate             = OpenAiCompatible.prototype.generate;
        const issuesDir                    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-pool-scope-'));
        let   capturedWhere                = 'UNSET';
        aiConfig.vectorDimension = 2;

        StorageRouter.getGraphCollection    = async () => ({query: async args => { capturedWhere = args.where; return {ids: [[]], distances: [[]]}; }});
        StorageRouter.getSummaryCollection  = async () => ({get: async () => ({documents: ['mock document']})});
        TextEmbeddingService.embedText      = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs  = async () => [];
        OpenAiCompatible.prototype.generate = async () => ({content: '{"strategic_brief":"stub"}'});

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({issuesDir, now: new Date('2026-05-28T00:00:00Z')});
        } finally {
            StorageRouter.getGraphCollection    = originalGetGraphCollection;
            StorageRouter.getSummaryCollection  = originalGetSummaryCollection;
            TextEmbeddingService.embedText      = originalEmbedText;
            GoldenPathSynthesizer.fetchOpenPRs  = originalFetchOpenPRs;
            OpenAiCompatible.prototype.generate = originalGenerate;
            fs.rmSync(issuesDir, {recursive: true, force: true});
        }

        // The candidate pool must be scoped to ISSUE + DISCUSSION vectors; without the filter the top-20
        // is dominated by the CONCEPT/ADR/GUIDES population and the state='OPEN' intersection is empty.
        // Both are execution-steerable (work-to-do / converge-to-drive) and embed with state metadata.
        expect(capturedWhere).toEqual({type: {'$in': ['ISSUE', 'DISCUSSION']}})
    });

    test('synthesizeGoldenPath surfaces current incidents, focus epics, and filters non-actionable computed recommendations', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const OpenAiCompatible             = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        const originalGenerate             = OpenAiCompatible.prototype.generate;
        const issuesDir                    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-current-focus-issues-'));
        const chunkDir                     = path.join(issuesDir, 'chunk-1');
        const now                          = new Date('2026-06-21T11:30:00Z');
        const suffix                       = `${process.pid}-${Date.now()}`;
        const readyId                      = `issue-ready-${suffix}`;
        const discussionId                 = `discussion-governance-${suffix}`;
        const epicId                       = `issue-epic-${suffix}`;
        const notReadyId                   = `issue-not-ready-${suffix}`;
        aiConfig.vectorDimension = 2;

        fs.mkdirSync(chunkDir, {recursive: true});
        fs.writeFileSync(path.join(chunkDir, 'issue-13750.md'), [
            '---',
            'id: 13750',
            "title: 'PRIO-ZERO: Golden Path release steering regression'",
            'state: OPEN',
            'labels:',
            '  - bug',
            '  - ai',
            '  - regression',
            '  - architecture',
            '  - model-experience',
            "createdAt: '2026-06-21T10:20:34Z'",
            "updatedAt: '2026-06-21T11:20:50Z'",
            'assignees:',
            '  - neo-gpt',
            '---',
            '# PRIO-ZERO: Golden Path release steering regression',
            '',
            'Agent OS orchestrator regression.'
        ].join('\n'));
        fs.writeFileSync(path.join(chunkDir, 'issue-13012.md'), [
            '---',
            'id: 13012',
            "title: 'Agent Harness v13.1 release epic'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            '  - epic',
            '  - ai',
            '  - architecture',
            'assignees: []',
            "createdAt: '2026-06-10T00:00:00Z'",
            "updatedAt: '2026-06-21T09:00:00Z'",
            'milestone: v13.1',
            'subIssuesCompleted: 5',
            'subIssuesTotal: 22',
            '---',
            '# Agent Harness v13.1 release epic'
        ].join('\n'));
        fs.writeFileSync(path.join(chunkDir, 'issue-12000.md'), [
            '---',
            'id: 12000',
            "title: 'Old generic AI enhancement'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            '  - ai',
            'assignees: []',
            "createdAt: '2026-05-01T00:00:00Z'",
            "updatedAt: '2026-05-01T00:00:00Z'",
            '---',
            '# Old generic AI enhancement'
        ].join('\n'));

        GraphService.upsertNode({
            id        : discussionId,
            type      : 'DISCUSSION',
            state     : 'OPEN',
            properties: {state: 'OPEN', title: 'Governance discussion'}
        });
        GraphService.upsertNode({
            id        : epicId,
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Epic should not be immediate work', labels: ['epic', 'ai']}
        });
        GraphService.upsertNode({
            id        : notReadyId,
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Not ready should not be immediate work', labels: ['not-code-ready', 'ai']}
        });
        GraphService.upsertNode({
            id        : readyId,
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Actionable release leaf', labels: ['bug', 'ai']}
        });

        StorageRouter.getGraphCollection = async () => ({
            query: async () => ({
                ids      : [[discussionId, epicId, notReadyId, readyId]],
                distances: [[0.01, 0.02, 0.03, 0.5]]
            })
        });
        StorageRouter.getSummaryCollection = async () => ({get: async () => ({documents: ['Agent OS regression focus']})});
        TextEmbeddingService.embedText      = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs  = async () => [];
        OpenAiCompatible.prototype.generate = async () => ({content: '{"strategic_brief":"stub"}'});

        const directFocusCandidates = issueFocusSections.buildCurrentFocusCandidates({issuesDir, now});

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({issuesDir, now});
        } finally {
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            OpenAiCompatible.prototype.generate = originalGenerate;
            fs.rmSync(issuesDir, {recursive: true, force: true});
        }

        const handoffContent  = fs.readFileSync(tmpHandoffFile, 'utf-8');
        const focusIndex      = handoffContent.indexOf('## Current Release / Incident Focus');
        const staleIndex      = handoffContent.indexOf('## Stale Assignment Candidates');
        const computedIndex   = handoffContent.indexOf('## Computed Golden Path');
        const focusSection    = handoffContent.slice(focusIndex, staleIndex);
        const computedSection = handoffContent.slice(computedIndex);

        expect(focusIndex).toBeGreaterThan(-1);
        expect(staleIndex).toBeGreaterThan(-1);
        expect(computedIndex).toBeGreaterThan(-1);
        expect(focusIndex).toBeLessThan(computedIndex);
        expect(directFocusCandidates.map(candidate => candidate.number)).toEqual([13750, 13012]);
        expect(focusSection).toContain('**#13750**');
        expect(focusSection).toContain('**#13012**');
        expect(focusSection).toContain('**epic umbrella**');
        expect(focusSection).toContain('17 open subs');
        expect(focusSection).not.toContain('Old generic AI enhancement');
        expect(handoffContent).toContain(readyId);
        expect(handoffContent).toContain(discussionId);  // discussions are now actionable (an open converge-to-drive)
        expect(computedSection).toContain([
            '## Computed Golden Path (Strategic Recommendation)',
            '',
            'Captured at: 2026-06-21 11:30 UTC',
            '',
            'Based on the latest Tri-Vector Synthesis and Topological Priorities, the following tasks are mathematically recommended as the next immediate focus:',
            ''
        ].join('\n'));
        expect(computedSection).toContain(`1. **${discussionId}**: Score 18.18 (Semantic: 9.09, Structural: 0.00)\n   - *Governance discussion*`);
        expect(computedSection).toContain(`2. **${readyId}**: Score 3.33 (Semantic: 1.67, Structural: 0.00)\n   - *Actionable release leaf*`);
        expect(computedSection).toContain('> **Strategic Interpretation:**\n> stub');
        expect(computedSection).not.toContain(epicId);    // epic label still excluded from rendered recommendations
        expect(computedSection).not.toContain(notReadyId);
    });

    test('synthesizeGoldenPath renders a contradiction diagnostic for blog routing during PRIO-zero focus (#13849)', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const issuesDir                    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-current-focus-contradiction-'));
        const chunkDir                     = path.join(issuesDir, 'chunk-1');
        const now                          = new Date('2026-06-22T02:55:31Z');
        const blogId                       = 'issue-10074';
        aiConfig.vectorDimension = 2;

        fs.mkdirSync(chunkDir, {recursive: true});
        fs.writeFileSync(path.join(chunkDir, 'issue-13750.md'), [
            '---',
            'id: 13750',
            "title: 'PRIO-ZERO: Golden Path frozen 18 days'",
            'state: OPEN',
            'labels:',
            '  - bug',
            '  - ai',
            '  - architecture',
            '  - model-experience',
            "createdAt: '2026-06-22T02:30:00Z'",
            "updatedAt: '2026-06-22T02:50:55Z'",
            'assignees:',
            '  - neo-opus-grace',
            '---',
            '# PRIO-ZERO: Golden Path frozen 18 days',
            '',
            'PRIO-ZERO incident focus: graph steering must not route agents away from the drain fix.'
        ].join('\n'));

        GraphService.upsertNode({
            id        : 'frontier',
            type      : 'SYSTEM_TENET',
            properties: {name: 'Active Context Frontier'}
        });
        GraphService.upsertNode({
            id        : blogId,
            type      : 'ISSUE',
            properties: {
                labels: ['documentation', 'Blog Post', 'ai'],
                state : 'OPEN',
                title : '[blog] Claude Code x Neo.mjs'
            }
        });
        GoldenPathSynthesizer.constructor.pruneStaleFrontierGuideEdges();
        GraphService.linkNodes('frontier', blogId, 'GUIDES', 7);

        StorageRouter.getGraphCollection = async () => ({
            query: async () => ({
                ids      : [[blogId]],
                distances: [[0.1]]
            })
        });
        StorageRouter.getSummaryCollection = async () => ({get: async () => ({documents: ['Golden Path stale forecast still routes blog work']})});
        TextEmbeddingService.embedText     = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => [];

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({issuesDir, now});
        } finally {
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            fs.rmSync(issuesDir, {recursive: true, force: true});
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');
        const guideTargets   = GraphService.db.edges
            .getByIndex('source', 'frontier')
            .filter(edge => edge.type === 'GUIDES')
            .map(edge => edge.target);

        expect(handoffContent).toContain('## Current Release / Incident Focus');
        expect(handoffContent).toContain('**#13750**');
        expect(handoffContent).toContain('Computed routing paused because the surviving content/narrative recommendation contradicts live Current Release / Incident Focus.');
        expect(handoffContent).toContain('Contradictory computed candidates filtered: issue-10074');
        expect(handoffContent).not.toMatch(/1\.\s+\*\*issue-10074\*\*:/);
        expect(guideTargets).not.toContain(blogId);
    });

    test('synthesizeGoldenPath renders empty computed diagnostics and clears stale frontier guides (#13828)', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const suffix                       = `${process.pid}-${Date.now()}`;
        const staleId                      = `issue-stale-guide-${suffix}`;
        const notReadyId                   = `issue-empty-not-ready-${suffix}`;
        aiConfig.vectorDimension = 2;

        GraphService.upsertNode({
            id        : 'frontier',
            type      : 'SYSTEM_TENET',
            properties: {name: 'Active Context Frontier'}
        });
        GraphService.upsertNode({
            id        : staleId,
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Stale guide edge'}
        });
        GraphService.upsertNode({
            id        : notReadyId,
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Not ready candidate', labels: ['not-code-ready', 'ai']}
        });
        GoldenPathSynthesizer.constructor.pruneStaleFrontierGuideEdges();
        GraphService.linkNodes('frontier', staleId, 'GUIDES', 3);

        StorageRouter.getGraphCollection = async () => ({
            query: async () => ({
                ids      : [[notReadyId]],
                distances: [[0.1]]
            })
        });
        StorageRouter.getSummaryCollection = async () => ({get: async () => ({documents: ['Agent OS regression focus']})});
        TextEmbeddingService.embedText = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => [];

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});
        } finally {
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');
        const guideTargets   = GraphService.db.edges
            .getByIndex('source', 'frontier')
            .filter(edge => edge.type === 'GUIDES')
            .map(edge => edge.target);

        expect(handoffContent).toContain('## Computed Golden Path (Strategic Recommendation)');
        expect(handoffContent).toContain('No actionable computed recommendations survived the current Tri-Vector filter pass.');
        expect(handoffContent).toContain('- Semantic candidates: 1');
        expect(handoffContent).toContain('- SQLite OPEN matches: 1');
        expect(handoffContent).toContain('- Non-actionable candidates filtered: 1');
        expect(handoffContent).toContain('- Selected top nodes: 0');
        expect(handoffContent).toMatch(/- Stale frontier GUIDES pruned: [1-9]\d*/);
        expect(guideTargets).not.toContain(staleId);
    });

    test('synthesizeGoldenPath renders the computed recommendation for scored, actionable nodes', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const OpenAiCompatible             = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        const originalGenerate             = OpenAiCompatible.prototype.generate;
        const suffix                       = `${process.pid}-${Date.now()}`;
        const readyId                      = `issue-route-ledger-ready-${suffix}`;
        const notReadyId                   = `issue-route-ledger-not-ready-${suffix}`;
        const blockedId                    = `issue-route-ledger-blocked-${suffix}`;
        const blockerId                    = `issue-route-ledger-blocker-${suffix}`;
        const sourceAId                    = `issue-route-ledger-source-a-${suffix}`;
        const sourceBId                    = `discussion-route-ledger-source-b-${suffix}`;
        aiConfig.vectorDimension = 2;

        GraphService.upsertNode({
            id        : 'frontier',
            type      : 'SYSTEM_TENET',
            properties: {name: 'Active Context Frontier'}
        });
        [
            {id: readyId, type: 'ISSUE', title: 'Implement same-run route ledger', labels: ['bug', 'ai']},
            {id: notReadyId, type: 'ISSUE', title: 'Deferred not-ready route', labels: ['not-code-ready', 'ai']},
            {id: blockedId, type: 'ISSUE', title: 'Blocked route', labels: ['bug', 'ai']},
            {id: blockerId, type: 'ISSUE', title: 'Open blocker', labels: ['bug', 'ai']},
            {id: sourceAId, type: 'ISSUE', title: 'Structural source A', labels: ['bug', 'ai']},
            {id: sourceBId, type: 'DISCUSSION', title: 'Structural source B', labels: ['architecture', 'ai']}
        ].forEach(node => GraphService.upsertNode({
            id        : node.id,
            type      : node.type,
            properties: {
                labels: node.labels,
                state : 'OPEN',
                title : node.title
            }
        }));
        GraphService.linkNodes(sourceAId, readyId, 'RESOLVES', 2);
        GraphService.linkNodes(sourceBId, readyId, 'ADVANCES', 1.5);
        GraphService.linkNodes(blockerId, blockedId, 'BLOCKS', 1);

        StorageRouter.getGraphCollection = async () => ({
            query: async () => ({
                ids      : [[readyId, notReadyId, blockedId]],
                distances: [[0.1, 0.2, 0.3]]
            })
        });
        StorageRouter.getSummaryCollection = async () => ({get: async () => ({documents: ['Golden Path route attribution focus']})});
        TextEmbeddingService.embedText = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => [];
        OpenAiCompatible.prototype.generate = async () => ({content: '{"strategic_brief":"stub"}'});

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({
                now                  : new Date('2026-07-02T08:40:00Z'),
                repoEnrichmentEnabled: false
            });
        } finally {
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            OpenAiCompatible.prototype.generate = originalGenerate;
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');
        const computedIndex  = handoffContent.indexOf('## Computed Golden Path (Strategic Recommendation)');

        // The ready, actionable node is routed and rendered; the not-ready and blocked nodes are gated out.
        expect(computedIndex).toBeGreaterThan(-1);
        expect(handoffContent).toContain(`${readyId}**: Score 13.50 (Semantic: 5.00, Structural: 3.50)`);
        expect(handoffContent).not.toContain(notReadyId);
        expect(handoffContent).not.toContain(blockedId);
    });

    test('synthesizeGoldenPath renders degraded diagnostics when semantic vector query fails (#13978)', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const suffix                       = `${process.pid}-${Date.now()}`;
        const staleId                      = `issue-stale-query-guide-${suffix}`;
        const queryError                   = new Error('Error executing plan: Internal error: Error finding id');
        aiConfig.vectorDimension = 2;

        GraphService.upsertNode({
            id        : 'frontier',
            type      : 'SYSTEM_TENET',
            properties: {name: 'Active Context Frontier'}
        });
        GraphService.upsertNode({
            id        : staleId,
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Stale query guide'}
        });
        GoldenPathSynthesizer.constructor.pruneStaleFrontierGuideEdges();
        GraphService.linkNodes('frontier', staleId, 'GUIDES', 3);
        fs.writeFileSync(tmpHandoffFile, [
            '# Stale Handoff',
            '',
            '### Recent Open PRs by Author',
            '- stale solo PR bloat',
            '',
            '1. **issue-9890**: stale computed route'
        ].join('\n'), 'utf-8');

        StorageRouter.getGraphCollection = async () => ({
            query: async () => { throw queryError; }
        });
        StorageRouter.getSummaryCollection = async () => ({
            get: async config => {
                if (Array.isArray(config?.ids)) {
                    return {
                        ids      : ['summary-1'],
                        documents: ['Golden Path should fail loud when Chroma cannot resolve an id']
                    };
                }

                return {
                    ids      : ['summary-1'],
                    metadatas: [{timestamp: '2026-06-24T23:00:00.000Z', graphDigested: true}]
                };
            }
        });
        TextEmbeddingService.embedText = async () => [0.1, 0.2];

        let outcome;
        try {
            outcome = await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});
        } finally {
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');
        const guideTargets   = GraphService.db.edges
            .getByIndex('source', 'frontier')
            .filter(edge => edge.type === 'GUIDES')
            .map(edge => edge.target);

        expect(outcome).toMatchObject({
            status      : 'failed',
            reasonCode  : 'semantic-query-failed',
            wroteHandoff: true
        });
        expect(outcome.error).toContain('Error finding id');
        expect(handoffContent).toContain('Golden Path degraded: the semantic route could not be computed safely.');
        expect(handoffContent).toContain('- Reason: `semantic-query-failed`');
        expect(handoffContent).toContain('No numbered immediate recommendation is rendered for this pass');
        expect(handoffContent).not.toContain('### Recent Open PRs by Author');
        expect(handoffContent).not.toContain('issue-9890');
        expect(guideTargets).not.toContain(staleId);
    });

    test('synthesizeGoldenPath prunes stale guides while preserving current computed guides (#13828)', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const OpenAiCompatible             = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        const originalGenerate             = OpenAiCompatible.prototype.generate;
        const suffix                       = `${process.pid}-${Date.now()}`;
        const staleId                      = `issue-stale-guide-nonzero-${suffix}`;
        const readyId                      = `issue-current-guide-${suffix}`;
        aiConfig.vectorDimension = 2;

        GraphService.upsertNode({
            id        : 'frontier',
            type      : 'SYSTEM_TENET',
            properties: {name: 'Active Context Frontier'}
        });
        GraphService.upsertNode({
            id        : staleId,
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Old computed guide'}
        });
        GraphService.upsertNode({
            id        : readyId,
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Current computed guide', labels: ['bug', 'ai']}
        });
        GoldenPathSynthesizer.constructor.pruneStaleFrontierGuideEdges();
        GraphService.linkNodes('frontier', staleId, 'GUIDES', 3);

        StorageRouter.getGraphCollection = async () => ({
            query: async () => ({
                ids      : [[readyId]],
                distances: [[0.1]]
            })
        });
        StorageRouter.getSummaryCollection = async () => ({get: async () => ({documents: ['Agent OS regression focus']})});
        TextEmbeddingService.embedText = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => [];
        OpenAiCompatible.prototype.generate = async () => ({content: '{"strategic_brief":"stub"}'});

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});
        } finally {
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            OpenAiCompatible.prototype.generate = originalGenerate;
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');
        const guideTargets   = GraphService.db.edges
            .getByIndex('source', 'frontier')
            .filter(edge => edge.type === 'GUIDES')
            .map(edge => edge.target);

        expect(handoffContent).toContain(readyId);
        expect(handoffContent).not.toContain('No actionable computed recommendations survived');
        expect(guideTargets).toContain(readyId);
        expect(guideTargets).not.toContain(staleId);
    });

    test('synthesizeGoldenPath lists the 10 most recent open PRs with cross-family status', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const issuesDir                    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-recent-pr-issues-'));
        aiConfig.vectorDimension = 2;
        aiConfig.goldenPathRecentOpenPrRenderLimit = 10;

        StorageRouter.getGraphCollection = async () => ({ query: async () => ({ ids: [['mock-id']], distances: [[0.1]] }) });
        StorageRouter.getSummaryCollection = async () => ({ get: async () => ({ documents: ['mock document'] }) });
        TextEmbeddingService.embedText = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(number => ({
            number,
            url           : `https://github.com/neomjs/neo/pull/${number}`,
            author        : {login: 'external-dev'},
            title         : `PR ${number}`,
            body          : '',
            createdAt     : `2026-05-${String(number).padStart(2, '0')}T00:00:00Z`,
            headRefOid    : `sha-${number}`,
            reviewRequests: [],
            reviews       : number === 12 ? [{state: 'APPROVED', body: 'LGTM', submittedAt: '2026-05-12T01:00:00Z', author: {login: 'neo-opus-ada'}}] : [],
            comments      : []
        }));

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({issuesDir});
        } finally {
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            fs.rmSync(issuesDir, {recursive: true, force: true});
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');

        expect(handoffContent).toContain('### Recent Open PRs (`10` of `12` items)');
        expect(handoffContent).toContain('**PR #12**');
        expect(handoffContent).toContain('cross-family reviewed: yes');
        expect(handoffContent).toContain('**PR #3**');
        expect(handoffContent).not.toContain('**PR #2**');
        expect(handoffContent).not.toContain('**PR #1**');
    });

    test('synthesizeGoldenPath renders degraded Strategic Interpretation reason when provider output is invalid', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const OpenAiCompatible             = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        const originalGenerate             = OpenAiCompatible.prototype.generate;
        const suffix                       = `${process.pid}-${Date.now()}`;
        const readyId                      = `issue-strategic-fallback-${suffix}`;
        aiConfig.vectorDimension = 2;

        GraphService.upsertNode({
            id        : readyId,
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Restore compact strategic brief', labels: ['bug', 'ai']}
        });

        StorageRouter.getGraphCollection = async () => ({
            query: async () => ({
                ids      : [[readyId]],
                distances: [[0.1]]
            })
        });
        StorageRouter.getSummaryCollection = async () => ({get: async () => ({documents: ['Sandman handoff bloat']})});
        TextEmbeddingService.embedText = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => [];
        OpenAiCompatible.prototype.generate = async () => ({content: 'not json'});

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({
                now                  : new Date('2026-06-25T02:03:00Z'),
                repoEnrichmentEnabled: false
            });
        } finally {
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            OpenAiCompatible.prototype.generate = originalGenerate;
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');

        expect(handoffContent).toContain('## Computed Golden Path (Strategic Recommendation)\n\nCaptured at: 2026-06-25 02:03 UTC\n\nBased on the latest Tri-Vector Synthesis');
        expect(handoffContent).not.toContain('*Latest update:');
        expect(handoffContent).not.toContain('## Golden Path Forecast Status');
        expect(handoffContent).not.toContain('- Route source: Hybrid GraphRAG');
        expect(handoffContent).toContain('> **Strategic Interpretation:**');
        expect(handoffContent).toContain('Strategic Interpretation degraded: the model-generated brief was not available (strategic-brief-invalid-json).');
        expect(handoffContent).toContain('The Computed Golden Path list above remains the mathematical route, but no synthetic rationale is generated for this pass.');
        expect(handoffContent).not.toContain(`The computed route is currently led by ${readyId}`);
    });

    test('buildStaleAssignmentCandidates returns an empty set when no synced issue is stale', () => {
        const issuesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-fresh-issues-'));
        const chunkDir  = path.join(issuesDir, 'chunk-1');
        fs.mkdirSync(chunkDir, {recursive: true});
        fs.writeFileSync(path.join(chunkDir, 'issue-9100.md'), [
            '---',
            'id: 9100',
            "title: 'Fresh issue'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees:',
            '  - neo-gpt',
            "createdAt: '2026-05-20T00:00:00Z'",
            "updatedAt: '2026-05-27T00:00:00Z'",
            "githubUrl: 'https://github.com/neomjs/neo/issues/9100'",
            'author: neo-gpt',
            '---',
            '# Fresh issue',
            '',
            '### @neo-gpt - 2026-05-27T00:00:00Z',
            '',
            'working'
        ].join('\n'));

        try {
            const candidates = buildStaleAssignmentCandidates({
                issuesDir,
                now: new Date('2026-05-28T00:00:00Z')
            });

            expect(candidates).toEqual([]);
        } finally {
            fs.rmSync(issuesDir, {recursive: true, force: true});
        }
    });

    test('renderStaleAssignmentCandidatesSection caps noisy local issue sync output', () => {
        const candidates = Array.from({length: 3}, (_, index) => ({
            assignees     : ['neo-gpt'],
            daysIdle      : 10 + index,
            lastActivityAt: `2026-05-0${index + 1}T00:00:00.000Z`,
            lastActivityBy: 'neo-gpt',
            number        : 9200 + index,
            reason        : 'assignee-comment',
            title         : `Candidate ${index + 1}`,
            url           : `https://github.com/neomjs/neo/issues/${9200 + index}`
        }));

        const section = renderStaleAssignmentCandidatesSection(candidates, {
            capturedAt: new Date('2026-05-28T00:00:00Z'),
            limit     : 2
        });

        expect(section).toContain('Showing 2 of 3 candidates');
        expect(section).toContain('Candidate 1');
        expect(section).toContain('Candidate 2');
        expect(section).not.toContain('Candidate 3');
    });

    test('buildSilentThreadCandidates filters unassigned atrophying issues and sorts by silence score', () => {
        const Synthesizer                      = GoldenPathSynthesizer.constructor;
        const originalGetIssueStructuralWeight = Synthesizer.getIssueStructuralWeight;
        const issuesDir                        = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-silent-threads-'));
        const chunkDir                         = path.join(issuesDir, 'chunk-1');
        fs.mkdirSync(chunkDir, {recursive: true});

        function writeIssue(number, lines) {
            fs.writeFileSync(path.join(chunkDir, `issue-${number}.md`), lines.join('\n'));
        }

        writeIssue(9301, [
            '---',
            'id: 9301',
            "title: 'Old unassigned fallback-weight issue'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees: []',
            "createdAt: '2026-04-01T00:00:00Z'",
            "updatedAt: '2026-05-08T00:00:00Z'",
            "githubUrl: 'https://github.com/neomjs/neo/issues/9301'",
            'author: neo-gpt',
            '---',
            '# Old unassigned fallback-weight issue'
        ]);
        writeIssue(9302, [
            '---',
            'id: 9302',
            "title: 'Assigned issue is stale-assignment domain'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees:',
            '  - neo-gpt',
            "createdAt: '2026-04-01T00:00:00Z'",
            "updatedAt: '2026-05-01T00:00:00Z'",
            '---',
            '# Assigned issue'
        ]);
        writeIssue(9303, [
            '---',
            'id: 9303',
            "title: 'Rejected issue'",
            'state: OPEN',
            'labels:',
            '  - needs-re-triage',
            'assignees: []',
            "createdAt: '2026-04-01T00:00:00Z'",
            "updatedAt: '2026-05-01T00:00:00Z'",
            '---',
            '# Rejected issue'
        ]);
        writeIssue(9304, [
            '---',
            'id: 9304',
            "title: 'Already golden issue'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees: []',
            "createdAt: '2026-04-01T00:00:00Z'",
            "updatedAt: '2026-05-01T00:00:00Z'",
            '---',
            '# Already golden issue'
        ]);
        writeIssue(9305, [
            '---',
            'id: 9305',
            "title: 'Fresh unassigned issue'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees: []',
            "createdAt: '2026-05-25T00:00:00Z'",
            "updatedAt: '2026-05-25T00:00:00Z'",
            '---',
            '# Fresh issue'
        ]);
        writeIssue(9306, [
            '---',
            'id: 9306',
            "title: 'Blocked unassigned issue'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees: []',
            'blockedBy:',
            '  - 9200',
            "createdAt: '2026-04-01T00:00:00Z'",
            "updatedAt: '2026-05-01T00:00:00Z'",
            '---',
            '# Blocked issue'
        ]);
        writeIssue(9307, [
            '---',
            'id: 9307',
            "title: 'High-structure old issue'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees: []',
            "createdAt: '2026-04-01T00:00:00Z'",
            "updatedAt: '2026-05-13T00:00:00Z'",
            "githubUrl: 'https://github.com/neomjs/neo/issues/9307'",
            '---',
            '# High-structure old issue'
        ]);

        Synthesizer.getIssueStructuralWeight = issueId => ({
            'issue-9307': 4
        })[issueId] || 0;

        try {
            const candidates = buildSilentThreadCandidates({
                issuesDir,
                now         : new Date('2026-05-28T00:00:00Z'),
                goldenIds   : new Set(['issue-9304']),
                graphService: null,
                minScore    : 14,
                thresholdMs : 14 * 24 * 60 * 60 * 1000
            });

            expect(candidates.map(candidate => candidate.number)).toEqual([9307, 9301]);
            expect(candidates[0].silenceScore).toBe(60);
            expect(candidates[1].silenceScore).toBe(20);
        } finally {
            Synthesizer.getIssueStructuralWeight = originalGetIssueStructuralWeight;
            fs.rmSync(issuesDir, {recursive: true, force: true});
        }
    });

    test('renderSilentThreadCandidatesSection renders empty and capped visibility-only output', () => {
        const empty = renderSilentThreadCandidatesSection([], {
            capturedAt: new Date('2026-05-28T00:00:00Z')
        });

        expect(empty).toContain('## Silent Threads');
        expect(empty).toContain('No silent thread candidates detected.');

        const candidates = Array.from({length: 3}, (_, index) => ({
            daysIdle        : 20 + index,
            lastActivityAt  : `2026-05-0${index + 1}T00:00:00.000Z`,
            lastActivityBy  : 'github-sync',
            number          : 9400 + index,
            reason          : 'updatedAt',
            silenceScore    : 40 + index,
            structuralWeight: 2,
            title           : `Silent Candidate ${index + 1}`,
            url             : `https://github.com/neomjs/neo/issues/${9400 + index}`
        }));

        const capped = renderSilentThreadCandidatesSection(candidates, {
            capturedAt: new Date('2026-05-28T00:00:00Z'),
            limit     : 2
        });

        expect(capped).toContain('visibility-only, no routing');
        expect(capped).toContain('Showing 2 of 3 candidates');
        expect(capped).toContain('Silent Candidate 1');
        expect(capped).toContain('Silent Candidate 2');
        expect(capped).not.toContain('Silent Candidate 3');
    });

    test('buildWorkGraphStallFindings emits deterministic ADR-0030 findings and suppresses deliberate defers', () => {
        const issuesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-stall-findings-'));
        const chunkDir  = path.join(issuesDir, 'chunk-1');
        const now       = new Date('2026-07-02T12:00:00Z');
        fs.mkdirSync(chunkDir, {recursive: true});

        function writeIssue(number, lines) {
            fs.writeFileSync(path.join(chunkDir, `issue-${number}.md`), lines.join('\n'));
        }

        writeIssue(9501, [
            '---',
            'id: 9501',
            "title: 'Benched owner lane with fresh comments'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees:',
            '  - neo-gemini-pro',
            "createdAt: '2026-06-01T00:00:00Z'",
            "updatedAt: '2026-07-02T11:00:00Z'",
            "githubUrl: 'https://github.com/neomjs/neo/issues/9501'",
            '---',
            '# Benched owner lane'
        ]);
        writeIssue(9502, [
            '---',
            'id: 9502',
            "title: 'Deliberately deferred benched lane'",
            'state: OPEN',
            'labels:',
            '  - not-code-ready',
            'assignees:',
            '  - neo-gemini-pro',
            "createdAt: '2026-06-01T00:00:00Z'",
            "updatedAt: '2026-07-02T11:00:00Z'",
            '---',
            '# Deferred benched owner lane'
        ]);
        writeIssue(9503, [
            '---',
            'id: 9503',
            "title: 'Closed-sub epic awaiting closure'",
            'state: OPEN',
            'labels:',
            '  - epic',
            'assignees:',
            '  - neo-gemini-pro',
            "createdAt: '2026-05-01T00:00:00Z'",
            "updatedAt: '2026-06-20T00:00:00Z'",
            'subIssuesCompleted: 3',
            'subIssuesTotal: 3',
            "githubUrl: 'https://github.com/neomjs/neo/issues/9503'",
            '---',
            '# Closed-sub epic'
        ]);
        writeIssue(9504, [
            '---',
            'id: 9504',
            "title: 'Active-owner closed-sub epic'",
            'state: OPEN',
            'labels:',
            '  - epic',
            'assignees:',
            '  - neo-gpt',
            "createdAt: '2026-05-01T00:00:00Z'",
            "updatedAt: '2026-06-20T00:00:00Z'",
            'subIssuesCompleted: 2',
            'subIssuesTotal: 2',
            '---',
            '# Active-owner epic'
        ]);
        writeIssue(9505, [
            '---',
            'id: 9505',
            "title: 'Resolved blocker defer with no motion'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees: []',
            'blockedBy:',
            '  - 9506',
            "createdAt: '2026-05-01T00:00:00Z'",
            "updatedAt: '2026-05-15T00:00:00Z'",
            "githubUrl: 'https://github.com/neomjs/neo/issues/9505'",
            '---',
            '# Resolved blocker defer'
        ]);

        const graphService = {
            db: {
                edges: {
                    getByIndex(index, target) {
                        return index === 'target' && target === 'issue-9505'
                            ? [{type: 'BLOCKS', source: 'issue-9506'}]
                            : []
                    }
                },
                getAdjacentNodes() {},
                nodes: {
                    get(id) {
                        return id === 'issue-9506' ? {properties: {state: 'CLOSED'}} : null
                    }
                }
            }
        };

        const prs = [
            {
                number   : 9601,
                title    : 'Approved PR at human gate',
                url      : 'https://github.com/neomjs/neo/pull/9601',
                createdAt: '2026-07-01T00:00:00Z',
                reviews  : [{author: {login: 'neo-opus-ada'}, state: 'APPROVED', submittedAt: '2026-07-01T01:00:00Z'}]
            },
            {
                number   : 9602,
                title    : 'Parked approved PR',
                body     : 'Parked-on: #14441 [OQ5] - governance hold',
                createdAt: '2026-07-01T00:00:00Z',
                reviews  : [{author: {login: 'neo-gpt'}, state: 'APPROVED', submittedAt: '2026-07-01T01:00:00Z'}]
            },
            {
                number   : 9603,
                title    : 'Required-change PR',
                createdAt: '2026-07-01T00:00:00Z',
                reviews  : [
                    {author: {login: 'neo-gpt'}, state: 'APPROVED', submittedAt: '2026-07-01T01:00:00Z'},
                    {author: {login: 'neo-gpt'}, state: 'CHANGES_REQUESTED', submittedAt: '2026-07-01T02:00:00Z'}
                ]
            }
        ];

        try {
            const findings = buildWorkGraphStallFindings({issuesDir, now, prs, graphService});
            const classes  = findings.map(finding => `${finding.findingClass}:${finding.subject.number}`);

            expect(classes).toEqual([
                'DECISION_STARVED:9601',
                'OWNER_BENCHED_LANE:9501',
                'OWNER_BENCHED_LANE:9503',
                'RESOLUTION_PENDING:9503',
                'STALE_DEFER:9505'
            ]);

            const ownerFinding = findings.find(finding => finding.findingClass === 'OWNER_BENCHED_LANE' && finding.subject.number === 9501);
            expect(ownerFinding).toMatchObject({
                grade             : 'verified-stall',
                sourceFidelity    : 'verified',
                verificationSource: 'identityRoots.mjs + local issue sync'
            });
            expect(ownerFinding.motionPredicate).toContain('participationStatus');
            expect(ownerFinding.evidenceRefs).toContain('ai/graph/identityRoots.mjs:neo-gemini-pro:operator_benched');
            expect(ownerFinding.waitingSince).toBe('2026-05-18T00:00:00.000Z');
            expect(ownerFinding.lastSeen).toBe('2026-07-02T12:00:00.000Z');

            expect(findings.some(finding => finding.subject.number === 9502)).toBe(false);
            expect(findings.some(finding => finding.subject.number === 9504)).toBe(false);
            expect(findings.some(finding => finding.subject.number === 9602)).toBe(false);
            expect(findings.some(finding => finding.subject.number === 9603)).toBe(false);

            const staleDefer = findings.find(finding => finding.findingClass === 'STALE_DEFER');
            expect(staleDefer.grade).toBe('candidate-stall');
            expect(staleDefer.deferDisposition.state).toBe('stale-defer');
            expect(staleDefer.evidenceRefs).toContain('blockedBy:9506');
            expect(staleDefer).toHaveProperty('ttlExpiresAt');
        } finally {
            fs.rmSync(issuesDir, {recursive: true, force: true});
        }
    });

    test('renderWorkGraphStallFindingsSection is bounded, visibility-only, and honors render-off', () => {
        const findings = [
            {
                evidenceRefs      : ['#9601', 'approvedAt:2026-07-01T01:00:00.000Z'],
                findingClass      : 'DECISION_STARVED',
                grade             : 'verified-stall',
                motionPredicate   : 'PR merges or loses approval',
                sourceFidelity    : 'verified',
                subject           : {number: 9601, title: 'Approved PR', type: 'PR'},
                waitingSince      : '2026-07-01T01:00:00.000Z'
            },
            {
                evidenceRefs      : ['#9505', 'blockedBy:9506'],
                findingClass      : 'STALE_DEFER',
                grade             : 'candidate-stall',
                motionPredicate   : 'defer exit satisfied',
                sourceFidelity    : 'candidate',
                subject           : {number: 9505, title: 'Resolved blocker defer', type: 'ISSUE'},
                waitingSince      : '2026-05-15T00:00:00.000Z'
            }
        ];

        const hidden = renderWorkGraphStallFindingsSection(findings, {renderEnabled: false});
        expect(hidden).toBe('');

        const section = renderWorkGraphStallFindingsSection(findings, {
            capturedAt: new Date('2026-07-02T12:00:00Z'),
            limit     : 1
        });

        expect(section).toContain('## Work-Graph Stall Inference');
        expect(section).toContain('visibility-only, no wakes, no reassignment, no routing-weight changes');
        expect(section).toContain('Verified Stalls (`1` of `1` items)');
        expect(section).toContain('PR #9601');
        expect(section).toContain('waitingSince: 2026-07-01T01:00:00.000Z');
        expect(section).toContain('<details><summary>Candidate / source-degraded findings (1)</summary>');
        expect(section).toContain('STALE_DEFER');
    });

    test('synthesizeGoldenPath renders Work-Graph Stall Inference from issue sync and PR state', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const issuesDir                    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-stall-render-issues-'));
        const chunkDir                     = path.join(issuesDir, 'chunk-1');
        aiConfig.vectorDimension = 2;
        fs.mkdirSync(chunkDir, {recursive: true});

        fs.writeFileSync(path.join(chunkDir, 'issue-9701.md'), [
            '---',
            'id: 9701',
            "title: 'Benched owner render lane'",
            'state: OPEN',
            'labels:',
            '  - enhancement',
            'assignees:',
            '  - neo-gemini-pro',
            "createdAt: '2026-06-01T00:00:00Z'",
            "updatedAt: '2026-07-02T11:00:00Z'",
            "githubUrl: 'https://github.com/neomjs/neo/issues/9701'",
            '---',
            '# Benched owner render lane'
        ].join('\n'));

        StorageRouter.getGraphCollection = async () => ({query: async () => ({ids: [[]], distances: [[]]})});
        StorageRouter.getSummaryCollection = async () => ({get: async () => ({documents: ['mock document']})});
        TextEmbeddingService.embedText = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => [{
            number   : 9702,
            title    : 'Approved PR render lane',
            url      : 'https://github.com/neomjs/neo/pull/9702',
            createdAt: '2026-07-01T00:00:00Z',
            reviews  : [{author: {login: 'neo-opus-ada'}, state: 'APPROVED', submittedAt: '2026-07-01T01:00:00Z'}]
        }];

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({
                issuesDir,
                now: new Date('2026-07-02T12:00:00Z')
            });
        } finally {
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            fs.rmSync(issuesDir, {recursive: true, force: true});
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');

        expect(handoffContent).toContain('## Active PR Cycle State');
        expect(handoffContent).toContain('## Work-Graph Stall Inference');
        expect(handoffContent).toContain('Benched owner render lane');
        expect(handoffContent).toContain('OWNER_BENCHED_LANE');
        expect(handoffContent).toContain('Approved PR render lane');
        expect(handoffContent).toContain('DECISION_STARVED');
        expect(handoffContent.indexOf('## Active PR Cycle State')).toBeLessThan(handoffContent.indexOf('## Work-Graph Stall Inference'));
    });

    test('synthesizeGoldenPath does not compose KB tenant telemetry into the handoff', () => {
        const source = fs.readFileSync(
            path.resolve(process.cwd(), 'ai/services/graph/GoldenPathSynthesizer.mjs'),
            'utf-8'
        );

        expect(source).not.toContain('renderKbMultiTenantHealthSection');
        expect(source).not.toContain('KB Multi-Tenant Health');
    });

    test('synthesizeGoldenPath skips Chroma query when embedding dimension mismatches vectorDimension', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const warnings                     = [];
        let   queryCalls                   = 0;

        aiConfig.embeddingProvider = 'gemini';
        aiConfig.embeddingModel    = 'gemini-embedding-001';
        aiConfig.vectorDimension   = 4096;

        StorageRouter.getGraphCollection = async () => ({
            query: async () => {
                queryCalls++;
                return {ids: [['mock-id']], distances: [[0.1]]};
            }
        });
        StorageRouter.getSummaryCollection = async () => ({ get: async () => ({ documents: ['mock document'] }) });
        TextEmbeddingService.embedText = async () => new Array(3072).fill(0.1);
        logger.warn = (...args) => warnings.push(args.join(' '));

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath();

            expect(queryCalls).toBe(0);

            const warningText = warnings.join('\n');
            expect(warningText).toContain('Embedding dimension mismatch before Chroma query');
            expect(warningText).toContain('provider=gemini');
            expect(warningText).toContain('model=gemini-embedding-001');
            expect(warningText).toContain('configuredVectorDimension=4096');
            expect(warningText).toContain('actualEmbeddingDimension=3072');
            expect(warningText).toContain('NEO_EMBEDDING_PROVIDER / NEO_VECTOR_DIMENSION');
        } finally {
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
        }
    });

    test('synthesizeGoldenPath includes OPEN discussions but excludes CLOSED ones from computed recommendations', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const OpenAiCompatible             = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        const originalGenerate             = OpenAiCompatible.prototype.generate;

        aiConfig.vectorDimension = 2;

        const openId   = `discussion-open-${Date.now()}`;
        const closedId = `discussion-closed-${Date.now()}`;
        const issueId  = `issue-actionable-${Date.now()}`;

        GraphService.upsertNode({
            id        : openId,
            type      : 'DISCUSSION',
            name      : 'Open Discussion Fixture',
            state     : 'OPEN',
            properties: {state: 'OPEN', title: 'Open Discussion Fixture'}
        });
        GraphService.upsertNode({
            id        : closedId,
            type      : 'DISCUSSION',
            name      : 'Closed Discussion Fixture',
            state     : 'CLOSED',
            properties: {state: 'CLOSED', title: 'Closed Discussion Fixture', closed: true}
        });
        GraphService.upsertNode({
            id        : issueId,
            type      : 'ISSUE',
            properties: {state: 'OPEN', title: 'Actionable Issue Fixture', labels: ['bug', 'ai']}
        });

        StorageRouter.getGraphCollection = async () => ({
            query: async () => ({ ids: [[openId, closedId, issueId]], distances: [[0.1, 0.01, 0.5]] })
        });
        StorageRouter.getSummaryCollection = async () => ({
            get: async () => ({documents: ['mock document']})
        });
        TextEmbeddingService.embedText      = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs  = async () => [];
        OpenAiCompatible.prototype.generate = async () => ({content: '{"strategic_brief":"stub"}'});

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath();
        } finally {
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            OpenAiCompatible.prototype.generate  = originalGenerate;
        }

        const handoffContent  = fs.readFileSync(tmpHandoffFile, 'utf-8');
        const computedIndex   = handoffContent.indexOf('## Computed Golden Path');
        const computedSection = handoffContent.slice(computedIndex);

        expect(handoffContent).toContain(issueId);
        expect(handoffContent).toContain(openId);        // open discussions are now actionable (converge-to-drive)
        expect(computedSection).not.toContain(closedId); // closed discussions excluded by the state='OPEN' gate
    });

    test('renderConsolidationGapsSection surfaces undigested sessions visibly (#13807)', async () => {
        const
            Synthesizer = GoldenPathSynthesizer.constructor,
            collection  = {
                get: async () => ({
                    ids      : ['s1', 's2', 's3'],
                    metadatas: [
                        {title: 'Digested one', graphDigested: true},
                        {title: 'Undigested A', graphDigested: false},
                        {title: 'Undigested B'} // no flag → undigested (graphDigested !== true)
                    ]
                })
            };

        const section = await Synthesizer.renderConsolidationGapsSection(collection);
        expect(section).toContain('## Consolidation Gaps');
        expect(section).toContain('2 session(s) undigested');
        expect(section).toContain('Undigested A');
        expect(section).toContain('Undigested B');
        expect(section).not.toContain('Digested one') // the digested session is not listed as a gap
    });

    test('renderConsolidationGapsSection renders the honest all-clear when none undigested (#13807)', async () => {
        const
            Synthesizer = GoldenPathSynthesizer.constructor,
            collection  = {get: async () => ({ids: ['s1'], metadatas: [{title: 'Done', graphDigested: true}]})};

        const section = await Synthesizer.renderConsolidationGapsSection(collection);
        expect(section).toContain('0 sessions undigested')
    });

    test('renderConsolidationGapsSection renders Status UNKNOWN when the query throws — never a false all-clear (#13809)', async () => {
        const
            Synthesizer = GoldenPathSynthesizer.constructor,
            collection  = {get: async () => { throw new Error('chroma unavailable'); }};

        const section = await Synthesizer.renderConsolidationGapsSection(collection);
        expect(section).toContain('## Consolidation Gaps');
        expect(section).toContain('Status UNKNOWN');
        expect(section).toContain('NOT an all-clear');
        expect(section).not.toContain('0 sessions undigested') // the false-green this section exists to prevent
    });

    test('renderConsolidationGapsSection renders Status UNKNOWN on a malformed response — never a false all-clear (#13809)', async () => {
        const
            Synthesizer = GoldenPathSynthesizer.constructor,
            collection  = {get: async () => ({})}; // malformed: no metadatas array

        const section = await Synthesizer.renderConsolidationGapsSection(collection);
        expect(section).toContain('Status UNKNOWN');
        expect(section).toContain('malformed');
        expect(section).not.toContain('0 sessions undigested') // a non-array response must not read as zero-undigested
    });
});

test.describe('GoldenPathSynthesizer.hasCrossFamilyReview — author family from canonical @identity', () => {
    let Synthesizer;

    // `@`-stripped login → modelFamily, matching getCoreSwarmAgentFamilies().
    const agentFamilies = {
        'neo-gpt'       : 'gpt',
        'neo-opus-grace': 'claude',
        'neo-opus-ada'  : 'claude',
        'neo-opus-vega' : 'claude'
    };

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/GoldenPathSynthesizer.mjs');
        Synthesizer = mod.default.constructor;
    });

    test('parseSelfIdLogin resolves the Social-Name-led form and the legacy @identity form', () => {
        // Legacy @identity form (transitional / pre-trim bodies).
        expect(Synthesizer.parseSelfIdLogin('Authored by GPT-5 (Codex Desktop), @neo-gpt (Euclid). Session x.')).toBe('neo-gpt');
        expect(Synthesizer.parseSelfIdLogin('Authored by Claude Opus 4.8 (Claude Code), @neo-opus-grace (Grace).')).toBe('neo-opus-grace');
        // Real PR bodies open with `Resolves #N`, so the self-id is mid-body — the /m anchor must still match it.
        expect(Synthesizer.parseSelfIdLogin('Resolves #1\n\nAuthored by GPT-5 (Codex Desktop), @neo-gpt (Euclid).')).toBe('neo-gpt');
        // Current Social-Name-led form (post-trim): resolve the Social Name to a login via the roster.
        expect(Synthesizer.parseSelfIdLogin('Authored by Euclid (GPT-5, Codex Desktop). Session x.')).toBe('neo-gpt');
        expect(Synthesizer.parseSelfIdLogin('Authored by Ada (Claude Opus 4.8, Claude Code).')).toBe('neo-opus-ada');
        expect(Synthesizer.parseSelfIdLogin('Resolves #1\n\nAuthored by Grace (Claude Opus 4.8, Claude Code).')).toBe('neo-opus-grace');
        expect(Synthesizer.parseSelfIdLogin('Authored by Unregistered Name (Some Model). Session x.')).toBe(null); // social name not in roster
        expect(Synthesizer.parseSelfIdLogin('Authored by GPT-5 (Codex Desktop). Session x.')).toBe(null); // model-led, no @identity; "GPT-5" not a social name
        // Overmatch guards: a `Co-Authored by` trailer or prose merely containing `Authored by` mid-line must NOT match.
        expect(Synthesizer.parseSelfIdLogin('Co-Authored by Claude Opus, @neo-opus-grace.')).toBe(null);
        expect(Synthesizer.parseSelfIdLogin('Note: Authored by old session @neo-gpt in context.')).toBe(null);
        expect(Synthesizer.parseSelfIdLogin('Body text\nCo-Authored by X, @neo-gpt\nmore')).toBe(null);
        expect(Synthesizer.parseSelfIdLogin(null)).toBe(null)
    });

    test('resolves author family from the body @identity, overriding a drifted GitHub login', () => {
        // The drift shape: the GitHub opener mis-resolved to a Claude login, but the body self-id is GPT.
        const pr = {
            number : 13233,
            author : {login: 'neo-opus-ada'}, // drifted (mis-resolved opener)
            body   : 'Authored by GPT-5 (Codex Desktop), @neo-gpt (Euclid). Session x.',
            reviews: [{author: {login: 'neo-opus-grace'}, state: 'APPROVED'}]
        };
        // Login-only reads author=claude, reviewer=claude -> false (the bug). The self-id reads author=gpt -> cross-family true.
        expect(Synthesizer.hasCrossFamilyReview(pr, agentFamilies)).toBe(true)
    });

    test('resolves author family from the Social-Name self-id, overriding a drifted GitHub login', () => {
        // Drift shape with the current trimmed format: opener mis-resolves to a Claude login; the body self-id is Euclid (GPT).
        const pr = {
            number : 13367,
            author : {login: 'neo-opus-ada'}, // drifted (mis-resolved opener)
            body   : 'Authored by Euclid (GPT-5, Codex Desktop). Session x.',
            reviews: [{author: {login: 'neo-opus-grace'}, state: 'APPROVED'}]
        };
        // The Social-Name self-id resolves author=gpt via the roster, so the claude reviewer makes it cross-family.
        expect(Synthesizer.hasCrossFamilyReview(pr, agentFamilies)).toBe(true)
    });

    test('falls back to the GitHub login when the body carries no @identity self-id (legacy)', () => {
        const pr = {
            number : 1,
            author : {login: 'neo-gpt'},
            body   : 'Authored by GPT-5 (Codex Desktop). Session x.', // no @identity → advisory login path
            reviews: [{author: {login: 'neo-opus-grace'}, state: 'APPROVED'}]
        };
        expect(Synthesizer.hasCrossFamilyReview(pr, agentFamilies)).toBe(true)
    });

    test('same-family author + reviewer (both Claude) is correctly NOT cross-family', () => {
        const pr = {
            number : 2,
            author : {login: 'someone-unmapped'},
            body   : 'Authored by Claude Opus 4.8 (Claude Code), @neo-opus-grace (Grace).',
            reviews: [{author: {login: 'neo-opus-ada'}, state: 'APPROVED'}] // both claude
        };
        expect(Synthesizer.hasCrossFamilyReview(pr, agentFamilies)).toBe(false)
    });
});
