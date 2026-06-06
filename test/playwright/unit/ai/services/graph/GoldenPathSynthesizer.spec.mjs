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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs';
import path           from 'path';
import os             from 'os';
import child_process  from 'child_process';
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
    let originalVectorDimension;
    let originalWarn;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const os = await import('os');
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        const testDbName = `memory-core-goldenpath-test-${process.pid}-${Date.now()}.sqlite`;
        const testDbPath = path.join(tmpDir, testDbName);
        aiConfig.storagePaths.graph = testDbPath;

        tmpHandoffFile = path.join(tmpDir, `mock_sandman_handoff_${process.pid}_${Date.now()}.md`);
        aiConfig.handoffFilePath = tmpHandoffFile;

        const GoldenPathSynthesizerModule = await import('../../../../../../ai/services/graph/GoldenPathSynthesizer.mjs');
        GoldenPathSynthesizer = GoldenPathSynthesizerModule.default;
        buildStaleAssignmentCandidates = GoldenPathSynthesizer.constructor.buildStaleAssignmentCandidates.bind(GoldenPathSynthesizer.constructor);
        renderStaleAssignmentCandidatesSection = GoldenPathSynthesizer.constructor.renderStaleAssignmentCandidatesSection.bind(GoldenPathSynthesizer.constructor);
        buildSilentThreadCandidates = GoldenPathSynthesizer.constructor.buildSilentThreadCandidates.bind(GoldenPathSynthesizer.constructor);
        renderSilentThreadCandidatesSection = GoldenPathSynthesizer.constructor.renderSilentThreadCandidatesSection.bind(GoldenPathSynthesizer.constructor);
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
        originalVectorDimension   = aiConfig.vectorDimension;
        originalWarn              = logger.warn;

        aiConfig.goldenPathRecentOpenPrRenderLimit       = 5;
        aiConfig.goldenPathTopNodeRenderLimit            = 10;
        aiConfig.goldenPathStaleAssignmentRenderLimit    = 20;
        aiConfig.goldenPathStaleAssignmentThresholdMs    = 7 * 24 * 60 * 60 * 1000;
        aiConfig.goldenPathSilentThreadMinScore          = 14;
        aiConfig.goldenPathSilentThreadRenderLimit       = 10;
        aiConfig.goldenPathSilentThreadThresholdMs       = 14 * 24 * 60 * 60 * 1000;
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
            'neo-claude-opus' : 'claude',
            'neo-gemini-pro': 'gemini',
            'neo-gpt'           : 'gpt',
            'neo-opus-ada'      : 'claude',
            'neo-opus-vega'     : 'claude'
        });

        expect(Synthesizer.getAgentLogins()).toEqual(expect.arrayContaining([
            'neo-claude-opus',
            'neo-gemini-pro',
            'neo-gpt',
            'neo-opus-ada',
            'neo-opus-vega'
        ]));
        expect(Synthesizer.getAgentLogins()).not.toContain('tobiu');

        expect(Synthesizer.getStaleAssignmentMaintainers()).toEqual(expect.arrayContaining([
            'neo-claude-opus',
            'neo-gemini-pro',
            'neo-gpt',
            'neo-opus-ada',
            'neo-opus-vega',
            'tobiu'
        ]));
    });

    test('hasCrossFamilyReview accepts injected identity-family maps', () => {
        const Synthesizer = GoldenPathSynthesizer.constructor;
        const pr = {
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

    test('findLastQualifyingAssignmentActivity treats owner identity comments as maintainer progress acknowledgements', () => {
        const Synthesizer = GoldenPathSynthesizer.constructor;
        const activity = Synthesizer.findLastQualifyingAssignmentActivity({
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
        const originalGetGraphCollection = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText = TextEmbeddingService.embedText;
        aiConfig.vectorDimension = 2;

        StorageRouter.getGraphCollection = async () => ({ query: async () => ({ ids: [['mock-id']], distances: [[0.1]] }) });
        StorageRouter.getSummaryCollection = async () => ({ get: async () => ({ documents: ['mock document'] }) });
        TextEmbeddingService.embedText = async () => [0.1, 0.2];

        // Mock gh pr list output
        const mockPrData = [
            {
                number: 11178,
                url: "https://github.com/neomjs/neo/pull/11178",
                author: { login: "neo-gemini-pro" },
                title: "feat(ai): Automate PR Cycle State Extraction",
                body: "lane-state: AWAITING_REVIEW\nCycle 2",
                createdAt: "2026-05-11T00:00:00Z",
                headRefOid: "abcdef1234567890",
                reviewRequests: [{ login: "neo-opus-ada" }],
                reviews: [
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
        expect(handoffContent).toContain('### Recent Open PRs');
        expect(handoffContent).toContain('cross-family reviewed: yes');
        expect(handoffContent).toContain('### @neo-gemini-pro');
        expect(handoffContent).toContain('- **PR #11178**: feat(ai): Automate PR Cycle State Extraction');
        expect(handoffContent).not.toContain('](https://github.com/');
        expect(handoffContent).toContain('- **Lane State**: `AWAITING_REVIEW`');
        expect(handoffContent).toContain('- **Cycle**: `2`');
        expect(handoffContent).toContain('- **Reviewers**: neo-opus-ada');
        expect(handoffContent).toContain('- **Status**: `CHANGES_REQUESTED`');
        expect(handoffContent).toContain('- **Head SHA**: `abcdef1234567890`');
    });

    test('synthesizeGoldenPath skips Neo repo enrichment sections when deployment config disables them', async () => {
        const originalGetGraphCollection = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText = TextEmbeddingService.embedText;
        const originalFetchOpenPRs = GoldenPathSynthesizer.fetchOpenPRs;
        const issuesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-recent-pr-issues-'));
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
        const originalGetGraphCollection = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText = TextEmbeddingService.embedText;
        const originalFetchOpenPRs = GoldenPathSynthesizer.fetchOpenPRs;
        const issuesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-stale-issues-'));
        const chunkDir  = path.join(issuesDir, 'chunk-1');
        const now       = new Date('2026-05-28T00:00:00Z');
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
        const originalGetGraphCollection = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText = TextEmbeddingService.embedText;
        const originalFetchOpenPRs = GoldenPathSynthesizer.fetchOpenPRs;
        const Synthesizer = GoldenPathSynthesizer.constructor;
        const originalGetIssueStructuralWeight = Synthesizer.getIssueStructuralWeight;
        const originalHasOpenIssueBlocker = Synthesizer.hasOpenIssueBlocker;
        const issuesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-silent-render-issues-'));
        const chunkDir  = path.join(issuesDir, 'chunk-1');
        const now       = new Date('2026-05-28T00:00:00Z');
        const goldenIssueId = `issue-silent-golden-${Date.now()}`;
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

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({issuesDir, now});
        } finally {
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
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

    test('synthesizeGoldenPath lists the 5 most recent open PRs with cross-family status', async () => {
        const originalGetGraphCollection = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText = TextEmbeddingService.embedText;
        const originalFetchOpenPRs = GoldenPathSynthesizer.fetchOpenPRs;
        const issuesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-recent-pr-issues-'));
        aiConfig.vectorDimension = 2;

        StorageRouter.getGraphCollection = async () => ({ query: async () => ({ ids: [['mock-id']], distances: [[0.1]] }) });
        StorageRouter.getSummaryCollection = async () => ({ get: async () => ({ documents: ['mock document'] }) });
        TextEmbeddingService.embedText = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => [1, 2, 3, 4, 5, 6].map(number => ({
            number,
            url: `https://github.com/neomjs/neo/pull/${number}`,
            author: {login: 'external-dev'},
            title: `PR ${number}`,
            body: '',
            createdAt: `2026-05-${String(number).padStart(2, '0')}T00:00:00Z`,
            headRefOid: `sha-${number}`,
            reviewRequests: [],
            reviews: number === 6 ? [{state: 'APPROVED', body: 'LGTM', submittedAt: '2026-05-06T01:00:00Z', author: {login: 'neo-opus-ada'}}] : [],
            comments: []
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

        expect(handoffContent).toContain('### Recent Open PRs');
        expect(handoffContent).toContain('**PR #6**');
        expect(handoffContent).toContain('cross-family reviewed: yes');
        expect(handoffContent).toContain('**PR #2**');
        expect(handoffContent).not.toContain('**PR #1**');
    });

    test('buildStaleAssignmentCandidates returns an empty set when no synced issue is stale', () => {
        const issuesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-fresh-issues-'));
        const chunkDir = path.join(issuesDir, 'chunk-1');
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
        const Synthesizer = GoldenPathSynthesizer.constructor;
        const originalGetIssueStructuralWeight = Synthesizer.getIssueStructuralWeight;
        const issuesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-silent-threads-'));
        const chunkDir  = path.join(issuesDir, 'chunk-1');
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
                now        : new Date('2026-05-28T00:00:00Z'),
                goldenIds  : new Set(['issue-9304']),
                graphService: null,
                minScore   : 14,
                thresholdMs: 14 * 24 * 60 * 60 * 1000
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
        let queryCalls                     = 0;

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

    test('synthesizeGoldenPath excludes CLOSED discussion nodes from computed recommendations', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const OpenAiCompatible             = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        const originalGenerate             = OpenAiCompatible.prototype.generate;

        aiConfig.vectorDimension = 2;

        const openId   = `discussion-open-${Date.now()}`;
        const closedId = `discussion-closed-${Date.now()}`;

        GraphService.upsertNode({
            id: openId,
            type: 'DISCUSSION',
            name: 'Open Discussion Fixture',
            state: 'OPEN',
            properties: {state: 'OPEN', title: 'Open Discussion Fixture'}
        });
        GraphService.upsertNode({
            id: closedId,
            type: 'DISCUSSION',
            name: 'Closed Discussion Fixture',
            state: 'CLOSED',
            properties: {state: 'CLOSED', title: 'Closed Discussion Fixture', closed: true}
        });

        StorageRouter.getGraphCollection = async () => ({
            query: async () => ({ ids: [[openId, closedId]], distances: [[0.1, 0.01]] })
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

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');

        expect(handoffContent).toContain(openId);
        expect(handoffContent).not.toContain(closedId);
    });
});
