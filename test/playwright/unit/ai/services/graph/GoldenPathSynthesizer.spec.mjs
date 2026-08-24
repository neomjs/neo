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
import {resolveCrossFamilyVerdict} from '../../../../../../ai/services/graph/agentFamilyResolution.mjs';
import {TestLifecycleHelper} from '../../services/memory-core/util.mjs';

test.describe('Neo.ai.daemons.services.GoldenPathSynthesizer', () => {
    test.describe.configure({mode: 'serial'});

    let GoldenPathSynthesizer;
    let Synthesizer;
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

    /**
     * @summary Builds a deterministic embedding with the resolved SSOT dimension, keeping tests from
     * mutating the shared AiConfig singleton merely to fit a two-element fixture.
     * @returns {Number[]}
     */
    function buildConfiguredEmbedding() {
        return new Array(Number(aiConfig.vectorDimension)).fill(0.1)
    }

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;

        // FAIL-LOUD ISOLATION GATE: this suite writes DISCUSSION/ISSUE fixture nodes through
        // GraphService. The graph db path is a READ-ONLY computed leaf derived from the
        // useTestDatabase toggle — the direct assignment below does NOT reliably re-point it, so
        // without the toggle a bare (non-runner) invocation resolves the PRODUCTION graph and the
        // fixtures pollute the live Computed Golden Path advisory (observed: fixture rows served
        // as the top-ROI release lane). The gate validates the RESOLVED target, not just the
        // toggle — an env override aliasing the test path onto the prod path is refused too.
        const {assertIsolatedGraphTarget} = await import('./graphIsolationGate.mjs');
        assertIsolatedGraphTarget(aiConfig.storagePaths);

        const os     = await import('os');
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        // Isolation is by construction: `storagePaths.graph` is a formula resolving `graphTest`
        // (`:memory:`) under `UNIT_TEST_MODE`, and a `:memory:` store is process-local — stronger
        // than the shared tmp file this suite used to repoint it at.

        // Read the resolved per-worker test handoff path (a computed formula under UNIT_TEST_MODE);
        // the writer targets the same resolved path, so the read-backs match. Mutating
        // aiConfig.handoffFilePath would NOT write through the formula (a read-only computed leaf).
        tmpHandoffFile = aiConfig.handoffFilePath;

        const GoldenPathSynthesizerModule = await import('../../../../../../ai/services/graph/GoldenPathSynthesizer.mjs');
        GoldenPathSynthesizer = GoldenPathSynthesizerModule.default;
        Synthesizer = GoldenPathSynthesizer.constructor;
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
        const tmpConceptSliceFile = path.join(path.dirname(tmpHandoffFile), 'sandman_concept_slice.md');
        if (fs.existsSync(tmpConceptSliceFile)) {
            try { fs.unlinkSync(tmpConceptSliceFile); } catch(e) {}
        }
    });

    test.afterAll(async () => {
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, null, fs, 'clear');
    });

    test('derives repo-enrichment identity projections from identityRoots', () => {

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
        // Release-agnostic: read the current release from the SSOT so the fixture never re-stales —
        // the exact hardcoded-'v13.1' staleness this behavior removes.
        const release   = aiConfig.currentReleaseVersion;
        const candidate = issueFocusSections.scoreCurrentFocusIssue({
            meta: {
                id                : 14310,
                title             : `Documentation & learning-experience overhaul (${release})`,
                state             : 'OPEN',
                labels            : ['documentation', 'epic', 'ai', 'architecture'],
                createdAt         : '2026-06-29T08:46:57Z',
                updatedAt         : '2026-06-29T09:44:27Z',
                milestone         : release,
                subIssuesCompleted: 3,
                subIssuesTotal    : 22
            },
            now
        });

        expect(candidate).toMatchObject({
            isEpic           : true,
            milestone        : release,
            number           : 14310,
            openSubIssueCount: 19
        });
        expect(candidate.reasons).toContain(release);
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
                title             : `Documentation & learning-experience overhaul (${release})`,
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
        expect(staleSyncCandidate.reasons).toContain(release);
    });

    test('hasCrossFamilyReview accepts injected identity-family maps', () => {
        const pr = {
            author : {login: 'author-agent'},
            // `state` is explicit because coverage now means an APPROVED review, not any review.
            // The fixture predates that distinction; the arm's subject is the injected map.
            reviews: [{author: {login: 'reviewer-agent'}, state: 'APPROVED'}]
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

    test('cross-family coverage requires an APPROVED review — attention is not coverage', () => {
        const families = {'author-agent': 'gpt', 'reviewer-agent': 'claude'};

        // Same cross-family reviewer, three states. Only one of them is coverage under the mandate,
        // and CHANGES_REQUESTED is the case where counting any state would be actively backwards.
        for (const state of ['COMMENTED', 'CHANGES_REQUESTED']) {
            const pr = {author: {login: 'author-agent'}, reviews: [{author: {login: 'reviewer-agent'}, state}]};

            expect(Synthesizer.hasCrossFamilyReview(pr, families), state).toBe(false);
        }

        const approved = {author: {login: 'author-agent'}, reviews: [{author: {login: 'reviewer-agent'}, state: 'APPROVED'}]};

        expect(Synthesizer.hasCrossFamilyReview(approved, families)).toBe(true);
    });

    test("a family recorded as 'unknown' COUNTS as differing — operator ruling, not a string accident", () => {
        // The roster records `unknown` for a seat whose engine nobody can state. Operator ruling
        // 2026-08-24: it counts as differing, so a guest seat's approvals can unblock a merge.
        // Asserted as a DECISION rather than left to fall out of `'unknown' !== 'claude'`, because
        // an arm that merely observes the string comparison would pass under either policy and
        // could not tell a future reader which one was chosen.
        const approverUnknown = {
            author : {login: 'author-agent'},
            reviews: [{author: {login: 'preview-agent'}, state: 'APPROVED'}]
        };

        expect(resolveCrossFamilyVerdict(approverUnknown, {
            'author-agent' : 'claude',
            'preview-agent': 'unknown'
        }).crossFamily).toBe(true);

        // Symmetric: an `unknown` AUTHOR is differed from by a known family.
        const authorUnknown = {
            author : {login: 'preview-agent'},
            reviews: [{author: {login: 'author-agent'}, state: 'APPROVED'}]
        };

        expect(resolveCrossFamilyVerdict(authorUnknown, {
            'preview-agent': 'unknown',
            'author-agent' : 'claude'
        }).crossFamily).toBe(true);

        // …but SAME-family is still same-family, so the permissive reading has not swallowed the
        // rule: two seats both carrying `unknown` do not differ from each other.
        expect(resolveCrossFamilyVerdict(approverUnknown, {
            'author-agent' : 'unknown',
            'preview-agent': 'unknown'
        }).crossFamily).toBe(false);
    });

    test('an unrostered author reports null, and the report keeps its external-contributor charity', () => {
        const pr = {
            author : {login: 'external-dev'},
            reviews: [{author: {login: 'reviewer-agent'}, state: 'APPROVED'}]
        };

        // Three states, not two. The mandate exists to stop one model family self-approving, which
        // an external human's PR does not risk — so the REPORT stays permissive here, unchanged.
        // The verdict keeps `null` distinct so a merge gate can apply its own policy instead of
        // inheriting that charity by accident.
        expect(resolveCrossFamilyVerdict(pr, {'reviewer-agent': 'claude'}).crossFamily).toBe(null);
        expect(Synthesizer.hasCrossFamilyReview(pr, {'reviewer-agent': 'claude'})).toBe(true);

        // …but charity is not blanket: with no classified approver at all there is nothing to be
        // charitable about, so it stays false rather than passing on the author's absence alone.
        expect(Synthesizer.hasCrossFamilyReview(pr, {})).toBe(false);
    });

    test('getRecentSummaryDocuments returns the N most-recent summaries by timestamp, newest-first (#13800)', async () => {
        const docMap     = {s1: 'doc-old', s2: 'doc-newest', s3: 'doc-mid'};
        const collection = {
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
        const collection = {get: async () => ({ids: [], metadatas: []})};

        expect(await Synthesizer.getRecentSummaryDocuments(collection, 2)).toEqual({documents: []});
    });

    test('findLastQualifyingAssignmentActivity treats owner identity comments as maintainer progress acknowledgements', () => {
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
        // The fixture's ONLY review is a CHANGES_REQUESTED from a cross-family reviewer, so the
        // honest answer is `no` — a blocked PR is the opposite of covered. This assertion read
        // `yes` while the predicate counted reviews of any state: the Golden Path was telling
        // readers that a PR its cross-family reviewer BLOCKED was covered by them.
        // Pinning the distinction rather than the value, so the arm fails in either direction.
        expect(handoffContent).toContain('cross-family reviewed: no');
        expect(handoffContent).toContain('- **PR #11178**: feat(ai): Automate PR Cycle State Extraction');
        expect(handoffContent).not.toContain('](https://github.com/');
        expect(handoffContent).not.toContain('### @neo-gemini-pro');
        expect(handoffContent).not.toContain('- **Lane State**:');
        expect(handoffContent).not.toContain('- **Cycle**:');
        expect(handoffContent).not.toContain('- **Reviewers**:');
        expect(handoffContent).not.toContain('- **Status**:');
        expect(handoffContent).not.toContain('- **Head SHA**:');
    });

    test('synthesizeGoldenPath no longer appends a Handoff Retrospective — the static history leg was removed from the Golden Path (#15089)', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        aiConfig.vectorDimension = 2;

        const now      = new Date();
        const hoursAgo = h => new Date(now.getTime() - h * 3600 * 1000).toISOString();

        StorageRouter.getGraphCollection   = async () => ({ query: async () => ({ ids: [['mock-id']], distances: [[0.1]] }) });
        // ONE collection double serving both consumers: document reads (semantic context) AND the
        // session reader's metadata scope — real metadata path: one in-window session, one
        // out-of-window, one undateable (no timestamp keys at all)
        StorageRouter.getSummaryCollection = async () => ({
            get: async ({include} = {}) => include?.includes('metadatas')
                ? {
                    ids      : ['abcdef1234567890', 'stale-session-id', 'undateable-id'],
                    metadatas: [
                        {timestamp: now.getTime() - 2 * 3600 * 1000, agent: '@neo-fable'},
                        {timestamp: now.getTime() - 500 * 3600 * 1000, agent: '@neo-gpt'},
                        {note: 'no timestamp keys'}
                    ]
                }
                : {documents: ['mock document']}
        });
        TextEmbeddingService.embedText     = async () => [0.1, 0.2];

        const originalFetchOpenPRs = GoldenPathSynthesizer.fetchOpenPRs;

        GoldenPathSynthesizer.fetchOpenPRs = async () => [
            {number: 14682, url: 'https://github.com/neomjs/neo/pull/14682', author: {login: 'neo-fable'}, title: 'registry snapshot clone', createdAt: hoursAgo(5), reviewRequests: [], reviews: [], comments: []}
        ];

        try {
            await GoldenPathSynthesizer.synthesizeGoldenPath({now});
        } finally {
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection            = originalGetSummaryCollection;
            TextEmbeddingService.embedText                = originalEmbedText;
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');

        // The static Handoff Retrospective + its readers were removed from the Golden Path: the
        // synthesized handoff renders no retrospective section and none of its counts. That surface
        // is the on-demand runtime query views (memory/session + PR-history) under their own contract.
        expect(handoffContent).not.toContain('## Handoff Retrospective');
        expect(handoffContent).not.toContain('- Merged PRs:');
    });

    test('an early unavailable exit republishes honest typed state, so a prior pass route cannot still execute', async () => {
        // The stale-route class: the early exits return before the sidecar write, so without an
        // honest republication the PREVIOUS pass's fresh, unexpired, executable route stays on disk
        // and a consumer keeps routing work this pass never computed.
        const routePath  = path.join(path.dirname(tmpHandoffFile), 'computed-route.json');
        const capturedAt = new Date(Date.now() - 60 * 1000).toISOString();
        const expiresAt  = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        fs.mkdirSync(path.dirname(routePath), {recursive: true});
        fs.writeFileSync(routePath, JSON.stringify({
            schemaVersion     : 'computed-route.v1',
            status            : 'fresh',
            notAuthority      : true,
            capturedAt,
            expiresAt,
            routeVersion      : 'rv-prior',
            sourceManifestHash: 'hash-prior',
            sourceWatermark   : 'wm-prior',
            provenance        : {producer: 'GoldenPathSynthesizer', runId: null, algorithmVersion: 'v-prior', citations: []},
            freshness         : {status: 'fresh', checkedAt: capturedAt, expiresAt},
            route             : {kind: 'computed-ranked', items: [{id: 'issue-9999', title: 'Prior pass executable route', score: 9.9, rank: 1}]}
        }, null, 2), 'utf-8');

        const originalGetGraphCollection = StorageRouter.getGraphCollection;

        StorageRouter.getGraphCollection = async () => {
            throw new Error('storage router unavailable')
        };

        try {
            const outcome = await GoldenPathSynthesizer.synthesizeGoldenPath();

            expect(outcome.reasonCode).toBe('storage-router-unavailable');
        } finally {
            StorageRouter.getGraphCollection = originalGetGraphCollection;
        }

        // This pass now owns the CURRENT typed state: the prior executable route is replaced by an
        // honest degraded outcome, which the consumer's freshness gate refuses.
        const republished = JSON.parse(fs.readFileSync(routePath, 'utf-8'));

        expect(republished.status).toBe('degraded');
        expect(republished.freshness.status).toBe('unverifiable');
        expect(republished.route.kind).toBe('none');
        expect(republished.route.items).toEqual([]);
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

    test('synthesizeGoldenPath splits the Concept Slice to a fresh idempotent companion, incl. the degraded path (#14885)', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalFetchOpenPRs         = GoldenPathSynthesizer.fetchOpenPRs;
        const originalRenderSlice          = GoldenPathSynthesizer.constructor.renderConceptSliceHandoffSection;
        const issuesDir                    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-concept-slice-split-'));
        const companionFile                = path.join(path.dirname(tmpHandoffFile), 'sandman_concept_slice.md');
        aiConfig.vectorDimension = 2;

        StorageRouter.getGraphCollection   = async () => ({ query: async () => ({ ids: [[]], distances: [[]] }) });
        StorageRouter.getSummaryCollection = async () => ({ get: async () => ({ documents: ['mock document'] }) });
        TextEmbeddingService.embedText     = async () => [0.1, 0.2];
        GoldenPathSynthesizer.fetchOpenPRs = async () => [];

        try {
            // (1) Normal render: a stale companion must be overwritten with the fresh slice; the handoff excludes it.
            fs.mkdirSync(path.dirname(tmpHandoffFile), {recursive: true});
            fs.writeFileSync(companionFile, '# STALE — must NOT survive\n');
            await GoldenPathSynthesizer.synthesizeGoldenPath({issuesDir});

            const handoff = fs.readFileSync(tmpHandoffFile, 'utf-8');
            expect(handoff).not.toContain('## Concept Slice');
            expect(handoff).not.toContain('### Edge Deltas');
            expect(handoff).not.toContain('### Open Gaps per Concept');

            const companion = fs.readFileSync(companionFile, 'utf-8');
            expect(companion).toContain('Concept Slice — Native Edge Graph analytics'); // header present in the sibling
            expect(companion).not.toContain('STALE');                                    // idempotent overwrite

            // (2) Degraded render ('' path): the stale companion is still overwritten with a marker, never left fresh.
            fs.writeFileSync(companionFile, '# STALE AGAIN — degraded path must overwrite\n');
            GoldenPathSynthesizer.constructor.renderConceptSliceHandoffSection = () => '';
            await GoldenPathSynthesizer.synthesizeGoldenPath({issuesDir});

            const degraded = fs.readFileSync(companionFile, 'utf-8');
            expect(degraded).not.toContain('STALE');
            expect(degraded).toContain('No Concept Slice generated this run');
        } finally {
            GoldenPathSynthesizer.constructor.renderConceptSliceHandoffSection = originalRenderSlice;
            GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            fs.rmSync(issuesDir, {recursive: true, force: true});
        }
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
        StorageRouter.getGraphCollection    = async () => ({query: async args => { capturedWhere = args.where; return {ids: [[]], distances: [[]]}; }});
        StorageRouter.getSummaryCollection  = async () => ({get: async () => ({documents: ['mock document']})});
        TextEmbeddingService.embedText      = async () => buildConfiguredEmbedding();
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

    test('adaptive admission widens past 20 rejected neighbors and renders the legitimate rank-21 candidate', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const OpenAiCompatible             = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        const originalGenerate             = OpenAiCompatible.prototype.generate;
        const widths                       = [];
        const ids                          = Array.from({length: 40}, (_, index) => `issue-${92000 + index}`);
        const rank21Id                     = ids[20];

        ids.forEach((id, index) => GraphService.upsertNode({
            id,
            type      : 'ISSUE',
            properties: {
                state : 'OPEN',
                title : index === 20 ? 'Legitimate rank-21 candidate' : `Semantic neighbor ${index + 1}`,
                labels: index >= 20 && index < 30 ? ['bug', 'ai'] : ['not-code-ready', 'ai']
            }
        }));

        StorageRouter.getGraphCollection = async () => ({
            query: async ({nResults, where}) => {
                widths.push(nResults);
                expect(where).toEqual({type: {'$in': ['ISSUE', 'DISCUSSION']}});
                return {
                    ids      : [ids.slice(0, nResults)],
                    distances: [ids.slice(0, nResults).map((id, index) => id === rank21Id ? 0 : 0.1 + index / 100)]
                }
            }
        });
        StorageRouter.getSummaryCollection  = async () => ({get: async () => ({documents: ['rank-21 admission proof']})});
        TextEmbeddingService.embedText      = async () => buildConfiguredEmbedding();
        OpenAiCompatible.prototype.generate = async () => ({content: '{"strategic_brief":"stub"}'});

        let outcome;
        try {
            outcome = await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});
        } finally {
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            OpenAiCompatible.prototype.generate = originalGenerate;
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');
        expect(widths).toEqual([20, 40]);
        expect(handoffContent).toContain(rank21Id);
        expect(handoffContent).toContain('Semantic: 10.00');
        expect(outcome).toMatchObject({
            status          : 'completed',
            selectedTopNodes: 10,
            scoringStats    : {
                semanticQueryPasses         : 2,
                semanticQueryRequestedWidth : 40,
                semanticCorpusExhausted     : false,
                candidateAdmissionStopReason: 'render-limit-satisfied'
            }
        })
    });

    test('malformed ANN envelopes and positional values fail loud on the first adaptive pass', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const malformedResults             = [
            {
                expectedError: 'invalid ids envelope',
                name         : 'missing ids envelope',
                result       : {distances: [[]]}
            },
            {
                expectedError: 'invalid ids envelope',
                name         : 'flat ids envelope',
                result       : {ids: ['issue-flat'], distances: [[0.1]]}
            },
            {
                expectedError: 'invalid ids envelope',
                name         : 'multi-query ids envelope',
                result       : {ids: [[], []], distances: [[], []]}
            },
            {
                expectedError: 'invalid distances envelope',
                name         : 'missing distances envelope',
                result       : {ids: [[]]}
            },
            {
                expectedError: 'invalid distances envelope',
                name         : 'flat distances envelope',
                result       : {ids: [['issue-flat-distance']], distances: [0.1]}
            },
            {
                expectedError: 'invalid distances envelope',
                name         : 'multi-query distances envelope',
                result       : {ids: [[]], distances: [[], []]}
            },
            {
                expectedError: 'non-string or empty id',
                name         : 'non-string id',
                result       : {ids: [[42]], distances: [[0.1]]}
            },
            {
                expectedError: 'non-string or empty id',
                name         : 'empty id',
                result       : {ids: [['  ']], distances: [[0.1]]}
            },
            {
                expectedError: 'non-finite, non-numeric, or negative distance',
                name         : 'numeric-string distance',
                result       : {ids: [['issue-string-distance']], distances: [['0.1']]}
            },
            {
                expectedError: 'non-finite, non-numeric, or negative distance',
                name         : 'negative distance',
                result       : {ids: [['issue-negative-distance']], distances: [[-0.1]]}
            },
            {
                expectedError: 'non-finite, non-numeric, or negative distance',
                name         : 'non-finite distance',
                result       : {ids: [['issue-infinite-distance']], distances: [[Infinity]]}
            }
        ];
        let semanticResult;

        StorageRouter.getGraphCollection   = async () => ({query: async () => semanticResult});
        StorageRouter.getSummaryCollection = async () => ({get: async () => ({documents: ['malformed-envelope proof']})});
        TextEmbeddingService.embedText     = async () => buildConfiguredEmbedding();

        try {
            for (const {expectedError, name, result} of malformedResults) {
                semanticResult = result;
                const outcome = await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});

                expect(outcome, name).toMatchObject({
                    status      : 'failed',
                    reasonCode  : 'semantic-query-failed',
                    scoringStats: {
                        semanticQueryPasses         : 1,
                        semanticQueryRequestedWidth : 20,
                        candidateAdmissionStopReason: 'semantic-query-failed'
                    }
                });
                expect(outcome.error, name).toContain(expectedError)
            }
        } finally {
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText
        }
    });

    test('adaptive admission bounds exact-width duplicate prefixes at the corpus-derived ceiling', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalRecordTypeRejections = Synthesizer.recordTypeGateRejections;
        const duplicateId                  = 'issue-92050';
        const recorded                     = [];
        const widths                       = [];

        GraphService.upsertNode({
            id        : duplicateId,
            type      : 'ISSUE',
            properties: {
                state : 'OPEN',
                title : 'Duplicate semantic neighbor',
                labels: ['not-code-ready', 'ai']
            }
        });

        StorageRouter.getGraphCollection = async () => ({
            count: async () => 25,
            query: async ({nResults}) => {
                widths.push(nResults);

                return {
                    ids      : [new Array(nResults).fill(duplicateId)],
                    distances: [new Array(nResults).fill(0.1)]
                }
            }
        });
        StorageRouter.getSummaryCollection = async () => ({get: async () => ({documents: ['duplicate-prefix proof']})});
        TextEmbeddingService.embedText     = async () => buildConfiguredEmbedding();
        Synthesizer.recordTypeGateRejections = async rejections => recorded.push(rejections);

        let outcome;
        try {
            outcome = await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});
        } finally {
            StorageRouter.getGraphCollection   = originalGetGraphCollection;
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
            TextEmbeddingService.embedText     = originalEmbedText;
            Synthesizer.recordTypeGateRejections = originalRecordTypeRejections;
        }

        expect(widths).toEqual([20, 26]);
        expect(outcome).toMatchObject({
            status      : 'failed',
            reasonCode  : 'candidate-admission-budget-exhausted',
            scoringStats: {
                semanticCorpusSize          : 25,
                semanticReturnedCandidates  : 26,
                semanticUniqueCandidates    : 1,
                semanticCandidates          : 1,
                nonActionableCandidates     : 1,
                semanticQueryPasses         : 2,
                semanticQueryRequestedWidth : 26,
                candidateAdmissionStopReason: 'candidate-admission-budget-exhausted'
            }
        });
        expect(recorded).toEqual([[]])
    });

    test('normalizeAdmissionTarget clamps fractional positive limits without mutating the config SSOT', () => {
        expect(Synthesizer.normalizeAdmissionTarget(0.5)).toBe(1);
        expect(Synthesizer.normalizeAdmissionTarget(2.9)).toBe(2);
        expect(Synthesizer.normalizeAdmissionTarget(0)).toBe(1);
        expect(Synthesizer.normalizeAdmissionTarget(Number.NaN)).toBe(1)
    });

    test('equal semantic candidates reorder after Hebbian reinforcement and ambient decay', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const OpenAiCompatible             = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        const originalGenerate             = OpenAiCompatible.prototype.generate;
        const candidateA                   = 'issue-92060';
        const candidateB                   = 'issue-92061';

        for (const [id, title] of [[candidateA, 'Initially stronger'], [candidateB, 'Reinforced mover']]) {
            GraphService.upsertNode({
                id,
                type      : 'ISSUE',
                properties: {state: 'OPEN', title, labels: ['bug', 'ai']}
            })
        }
        GraphService.upsertNode({id: 'session-92060', type: 'SESSION', properties: {state: 'CLOSED'}});
        GraphService.upsertNode({id: 'session-92061', type: 'SESSION', properties: {state: 'CLOSED'}});
        GraphService.linkNodes('session-92060', candidateA, 'RELATES_TO', 1);
        GraphService.linkNodes('session-92061', candidateB, 'RELATES_TO', 0.1);

        StorageRouter.getGraphCollection = async () => ({
            count: async () => 2,
            query: async () => ({
                ids      : [[candidateA, candidateB]],
                distances: [[0.1, 0.1]]
            })
        });
        StorageRouter.getSummaryCollection  = async () => ({get: async () => ({documents: ['Hebbian reorder proof']})});
        TextEmbeddingService.embedText      = async () => buildConfiguredEmbedding();
        OpenAiCompatible.prototype.generate = async () => ({content: '{"strategic_brief":"stub"}'});

        try {
            const firstOutcome   = await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});
            let   handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');
            expect(firstOutcome).toMatchObject({status: 'completed', selectedTopNodes: 2});
            expect(handoffContent.indexOf(`1. **${candidateA}**`)).toBeGreaterThan(-1);
            expect(handoffContent.indexOf(`1. **${candidateA}**`)).toBeLessThan(handoffContent.indexOf(`2. **${candidateB}**`));

            // Remove the route's own output before changing ambient evidence. Two reinforcements lift B
            // from 0.1 to 1.1; the forced 0.5 decay then leaves B at 0.55 and A at 0.5.
            Synthesizer.pruneStaleFrontierGuideEdges({graphService: GraphService, currentTargetIds: new Set()});
            expect(GraphService.db.storage.db.prepare(`
                SELECT count(*) AS count
                FROM Edges
                WHERE source = 'frontier'
                  AND type = 'GUIDES'
                  AND target IN (?, ?)
            `).get(candidateA, candidateB).count).toBe(0);
            GraphService.linkNodes('session-92061', candidateB, 'RELATES_TO', 5);
            GraphService.linkNodes('session-92061', candidateB, 'RELATES_TO', 5);
            GraphService.decayGlobalTopology(0.5, 0.1, true);
            fs.unlinkSync(tmpHandoffFile);

            const
                edgeRows      = GraphService.db.storage.db.prepare(`
                    SELECT target, type, CAST(json_extract(data, '$.properties.weight') AS REAL) AS weight
                    FROM Edges
                    WHERE target IN (?, ?)
                      AND source != 'frontier'
                    ORDER BY target, type
                `).all(candidateA, candidateB),
                supportA      = GraphService.getInboundStructuralSupport({id: candidateA}),
                supportB      = GraphService.getInboundStructuralSupport({id: candidateB}),
                secondOutcome = await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});

            expect(edgeRows).toEqual([
                {target: candidateA, type: 'RELATES_TO', weight: 0.5},
                {target: candidateB, type: 'RELATES_TO', weight: 0.55}
            ]);
            expect(supportB.totalWeight).toBeGreaterThan(supportA.totalWeight);
            expect(secondOutcome).toMatchObject({status: 'completed', selectedTopNodes: 2});
            handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');
            expect(handoffContent.indexOf(`1. **${candidateB}**`)).toBeGreaterThan(-1);
            expect(handoffContent.indexOf(`1. **${candidateB}**`)).toBeLessThan(handoffContent.indexOf(`2. **${candidateA}**`))
        } finally {
            StorageRouter.getGraphCollection    = originalGetGraphCollection;
            StorageRouter.getSummaryCollection  = originalGetSummaryCollection;
            TextEmbeddingService.embedText      = originalEmbedText;
            OpenAiCompatible.prototype.generate = originalGenerate
        }
    });

    test('a degraded later widening pass discards the earlier partial route and provisional rejections', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalRecordTypeRejections = Synthesizer.recordTypeGateRejections;
        const ids                          = Array.from({length: 20}, (_, index) => `issue-${92100 + index}`);
        const validId                      = ids[0];
        const recorded                     = [];
        const widths                       = [];

        ids.forEach((id, index) => GraphService.upsertNode({
            id,
            type      : 'ISSUE',
            properties: {
                state : 'OPEN',
                title : index === 0 ? 'Provisional survivor' : `Provisional rejection ${index}`,
                labels: index === 0 ? ['bug', 'ai'] : ['epic', 'ai']
            }
        }));

        StorageRouter.getGraphCollection = async () => ({
            query: async ({nResults}) => {
                widths.push(nResults);
                return nResults === 20 ? {
                    ids      : [ids],
                    distances: [ids.map((id, index) => 0.1 + index / 100)]
                } : {
                    ids            : [[]],
                    distances      : [[]],
                    _degraded      : true,
                    _degradedReason: 'second-pass graph query degraded'
                }
            }
        });
        StorageRouter.getSummaryCollection = async () => ({get: async () => ({documents: ['later-pass failure proof']})});
        TextEmbeddingService.embedText     = async () => buildConfiguredEmbedding();
        Synthesizer.recordTypeGateRejections = async rejections => recorded.push(rejections);

        let outcome;
        try {
            outcome = await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});
        } finally {
            StorageRouter.getGraphCollection    = originalGetGraphCollection;
            StorageRouter.getSummaryCollection  = originalGetSummaryCollection;
            TextEmbeddingService.embedText      = originalEmbedText;
            Synthesizer.recordTypeGateRejections = originalRecordTypeRejections;
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');
        expect(widths).toEqual([20, 40]);
        expect(outcome).toMatchObject({
            status      : 'failed',
            reasonCode  : 'semantic-query-failed',
            scoringStats: {
                semanticQueryPasses         : 2,
                semanticQueryRequestedWidth : 40,
                candidateAdmissionStopReason: 'semantic-query-failed'
            }
        });
        expect(handoffContent).not.toContain(validId);
        expect(recorded).toEqual([[]])
    });

    test('a malformed ANN envelope on a later widening pass fails loud and discards provisional output', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalRecordTypeRejections = Synthesizer.recordTypeGateRejections;
        const ids                          = Array.from({length: 40}, (_, index) => `issue-${92140 + index}`);
        const provisionalId                = ids[0];
        const recorded                     = [];
        const widths                       = [];

        ids.slice(0, 20).forEach((id, index) => GraphService.upsertNode({
            id,
            type      : 'ISSUE',
            properties: {
                state : 'OPEN',
                title : index === 0 ? 'Provisional survivor' : `Provisional malformed-distance rejection ${index}`,
                labels: index === 0 ? ['bug', 'ai'] : ['not-code-ready', 'ai']
            }
        }));

        StorageRouter.getGraphCollection = async () => ({
            query: async ({nResults}) => {
                widths.push(nResults);
                const resultIds = ids.slice(0, nResults);

                return nResults === 20 ? {
                    ids      : [resultIds],
                    distances: [resultIds.map((id, index) => 0.1 + index / 100)]
                } : {
                    ids: [resultIds]
                }
            }
        });
        StorageRouter.getSummaryCollection = async () => ({get: async () => ({documents: ['malformed-envelope proof']})});
        TextEmbeddingService.embedText     = async () => buildConfiguredEmbedding();
        Synthesizer.recordTypeGateRejections = async rejections => recorded.push(rejections);

        let outcome;
        try {
            outcome = await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});
        } finally {
            StorageRouter.getGraphCollection    = originalGetGraphCollection;
            StorageRouter.getSummaryCollection  = originalGetSummaryCollection;
            TextEmbeddingService.embedText      = originalEmbedText;
            Synthesizer.recordTypeGateRejections = originalRecordTypeRejections
        }

        expect(widths).toEqual([20, 40]);
        expect(outcome).toMatchObject({
            status      : 'failed',
            reasonCode  : 'semantic-query-failed',
            error       : 'Graph semantic query returned an invalid distances envelope; expected exactly one nested query-result array',
            scoringStats: {
                semanticQueryPasses         : 2,
                semanticQueryRequestedWidth : 40,
                candidateAdmissionStopReason: 'semantic-query-failed'
            }
        });
        expect(fs.readFileSync(tmpHandoffFile, 'utf-8')).not.toContain(provisionalId);
        expect(recorded).toEqual([[]])
    });

    test('a later structural-projection failure discards the provisional route and fails loud', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalGetInboundSupport    = GraphService.getInboundStructuralSupport;
        const originalRecordTypeRejections = Synthesizer.recordTypeGateRejections;
        const ids                          = Array.from({length: 20}, (_, index) => `issue-${92150 + index}`);
        const validId                      = ids[0];
        const recorded                     = [];
        let   queryPass                    = 0;

        ids.forEach((id, index) => GraphService.upsertNode({
            id,
            type      : 'ISSUE',
            properties: {
                state : 'OPEN',
                title : index === 0 ? 'Provisional structural survivor' : `Structural rejection ${index}`,
                labels: index === 0 ? ['bug', 'ai'] : ['epic', 'ai']
            }
        }));

        StorageRouter.getGraphCollection = async () => ({
            query: async () => {
                queryPass++;
                return {
                    ids      : [ids],
                    distances: [ids.map((id, index) => 0.1 + index / 100)]
                }
            }
        });
        StorageRouter.getSummaryCollection = async () => ({get: async () => ({documents: ['structural failure proof']})});
        TextEmbeddingService.embedText      = async () => buildConfiguredEmbedding();
        GraphService.getInboundStructuralSupport = function(data) {
            if (queryPass === 2) throw new Error('second-pass structural projection failed');
            return originalGetInboundSupport.call(this, data)
        };
        Synthesizer.recordTypeGateRejections = async rejections => recorded.push(rejections);

        let outcome;
        try {
            outcome = await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});
        } finally {
            StorageRouter.getGraphCollection          = originalGetGraphCollection;
            StorageRouter.getSummaryCollection        = originalGetSummaryCollection;
            TextEmbeddingService.embedText            = originalEmbedText;
            GraphService.getInboundStructuralSupport  = originalGetInboundSupport;
            Synthesizer.recordTypeGateRejections      = originalRecordTypeRejections;
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');
        expect(queryPass).toBe(2);
        expect(outcome).toMatchObject({
            status      : 'failed',
            reasonCode  : 'graph-store-mapping-failed',
            scoringStats: {candidateAdmissionStopReason: 'graph-store-mapping-failed'}
        });
        expect(handoffContent).not.toContain(validId);
        expect(recorded).toEqual([[]])
    });

    test('Discussion liveness uses decaying support, rejects protected-only archaeology, and proves short-corpus exhaustion', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalRecordTypeRejections = Synthesizer.recordTypeGateRejections;
        const OpenAiCompatible             = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        const originalGenerate             = OpenAiCompatible.prototype.generate;
        const protectedOnlyId              = 'discussion-92200';
        const decayingId                   = 'discussion-92201';
        const terminalId                   = 'discussion-92202';
        const recorded                     = [];

        [
            {
                id         : protectedOnlyId,
                disposition: 'undetermined',
                reason     : 'no-authoritative-lifecycle-marker',
                evidence   : []
            },
            {
                id         : decayingId,
                disposition: 'undetermined',
                reason     : 'no-authoritative-lifecycle-marker',
                evidence   : []
            },
            {
                id         : terminalId,
                disposition: 'terminal',
                reason     : 'graduated-to-ticket',
                evidence   : ['marker:GRADUATED_TO_TICKET']
            }
        ].forEach(({id, disposition, reason, evidence}) => GraphService.upsertNode({
            id,
            type      : 'DISCUSSION',
            properties: {
                state                          : 'OPEN',
                title                          : id,
                routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
                routingDisposition             : disposition,
                routingDispositionReason       : reason,
                routingDispositionEvidence     : evidence
            }
        }));
        ['protected-source', 'decaying-source', 'terminal-source'].forEach(id => GraphService.upsertNode({id, type: 'ISSUE'}));
        GraphService.linkNodes('protected-source', protectedOnlyId, 'RESOLVES', 2);
        GraphService.linkNodes('decaying-source', decayingId, 'GUIDES', 1);
        GraphService.linkNodes('terminal-source', terminalId, 'GUIDES', 1);

        StorageRouter.getGraphCollection = async () => ({
            query: async () => ({
                ids      : [[protectedOnlyId, decayingId, terminalId]],
                distances: [[0.1, 0.2, 0.3]]
            })
        });
        StorageRouter.getSummaryCollection = async () => ({get: async () => ({documents: ['Discussion liveness proof']})});
        TextEmbeddingService.embedText     = async () => buildConfiguredEmbedding();
        Synthesizer.recordTypeGateRejections = async rejections => recorded.push(rejections);
        OpenAiCompatible.prototype.generate = async () => ({content: '{"strategic_brief":"stub"}'});

        let outcome;
        try {
            outcome = await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});
        } finally {
            StorageRouter.getGraphCollection    = originalGetGraphCollection;
            StorageRouter.getSummaryCollection  = originalGetSummaryCollection;
            TextEmbeddingService.embedText      = originalEmbedText;
            Synthesizer.recordTypeGateRejections = originalRecordTypeRejections;
            OpenAiCompatible.prototype.generate = originalGenerate;
        }

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');
        expect(handoffContent).toContain(decayingId);
        expect(handoffContent).not.toContain(protectedOnlyId);
        expect(handoffContent).not.toContain(terminalId);
        expect(recorded).toHaveLength(1);
        expect(recorded[0]).toEqual(expect.arrayContaining([
            {nodeId: protectedOnlyId, rejectionBucket: ['undetermined-no-decaying-support'], stage: 'discussion-liveness-gate'},
            {nodeId: terminalId, rejectionBucket: ['terminal'], stage: 'discussion-liveness-gate'}
        ]));
        expect(outcome.scoringStats).toMatchObject({
            discussionLivenessRejections: 2,
            semanticCorpusExhausted     : true,
            candidateAdmissionStopReason: 'semantic-corpus-exhausted'
        })
    });

    test('a prior Golden Path GUIDES edge cannot self-authorize an undetermined Discussion on the next run', async () => {
        const originalGetGraphCollection   = StorageRouter.getGraphCollection;
        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const originalEmbedText            = TextEmbeddingService.embedText;
        const originalRecordTypeRejections = Synthesizer.recordTypeGateRejections;
        const OpenAiCompatible             = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        const originalGenerate             = OpenAiCompatible.prototype.generate;
        const discussionId                 = 'discussion-92210';
        const recorded                     = [];

        GraphService.upsertNode({
            id        : discussionId,
            type      : 'DISCUSSION',
            properties: {
                state                          : 'OPEN',
                title                          : 'One-run convergence proof',
                routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
                routingDisposition             : 'active',
                routingDispositionReason       : 'explicit-active-marker',
                routingDispositionEvidence     : ['marker:CONVERGING']
            }
        });

        StorageRouter.getGraphCollection = async () => ({
            query: async () => ({ids: [[discussionId]], distances: [[0.1]]})
        });
        StorageRouter.getSummaryCollection  = async () => ({get: async () => ({documents: ['self-guidance proof']})});
        TextEmbeddingService.embedText      = async () => buildConfiguredEmbedding();
        Synthesizer.recordTypeGateRejections = async rejections => recorded.push(rejections);
        OpenAiCompatible.prototype.generate = async () => ({content: '{"strategic_brief":"stub"}'});

        try {
            const first = await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});
            expect(first.selectedTopNodes).toBe(1);
            const priorRouteSupport = GraphService.getInboundStructuralSupport({id: discussionId});
            expect(priorRouteSupport.totalWeight).toBeGreaterThan(0);
            expect(priorRouteSupport.decayingWeight).toBe(0);

            GraphService.upsertNode({
                id        : discussionId,
                type      : 'DISCUSSION',
                properties: {
                    state                          : 'OPEN',
                    title                          : 'One-run convergence proof',
                    routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
                    routingDisposition             : 'undetermined',
                    routingDispositionReason       : 'no-authoritative-lifecycle-marker',
                    routingDispositionEvidence     : []
                }
            });

            const second         = await GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false});
            const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');

            expect(second.selectedTopNodes).toBe(0);
            expect(handoffContent).not.toContain(discussionId);
            expect(recorded.at(-1)).toEqual([
                {
                    nodeId         : discussionId,
                    rejectionBucket: ['undetermined-no-decaying-support'],
                    stage          : 'discussion-liveness-gate'
                }
            ])
        } finally {
            StorageRouter.getGraphCollection          = originalGetGraphCollection;
            StorageRouter.getSummaryCollection        = originalGetSummaryCollection;
            TextEmbeddingService.embedText            = originalEmbedText;
            Synthesizer.recordTypeGateRejections      = originalRecordTypeRejections;
            OpenAiCompatible.prototype.generate       = originalGenerate;
        }
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
        const release = aiConfig.currentReleaseVersion; // release-agnostic: the current-release epic tracks the SSOT
        fs.writeFileSync(path.join(chunkDir, 'issue-13012.md'), [
            '---',
            'id: 13012',
            `title: 'Agent Harness ${release} release epic'`,
            'state: OPEN',
            'labels:',
            '  - enhancement',
            '  - epic',
            '  - ai',
            '  - architecture',
            'assignees: []',
            "createdAt: '2026-06-10T00:00:00Z'",
            "updatedAt: '2026-06-21T09:00:00Z'",
            `milestone: ${release}`,
            'subIssuesCompleted: 5',
            'subIssuesTotal: 22',
            '---',
            `# Agent Harness ${release} release epic`
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
            properties: {
                state                          : 'OPEN',
                title                          : 'Governance discussion',
                routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
                routingDisposition             : 'active',
                routingDispositionReason       : 'explicit-active-marker',
                routingDispositionEvidence     : ['marker:CONVERGING']
            }
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

        // Handoff-parity pin: the human section and the typed route describe the SAME route. The
        // section renders FROM route.items, so an id-set/order divergence is structurally impossible
        // — this pins that the two representations cannot drift apart again.
        const typedRoute  = JSON.parse(fs.readFileSync(path.join(path.dirname(tmpHandoffFile), 'computed-route.json'), 'utf-8')),
              renderedIds = [...computedSection.matchAll(/^\d+\. \*\*([^*]+)\*\*:/gm)].map(match => match[1]);

        expect(typedRoute.route.kind).toBe('computed-ranked');
        expect(typedRoute.route.items.map(item => item.id)).toEqual([discussionId, readyId]);
        expect(renderedIds).toEqual(typedRoute.route.items.map(item => item.id));

        // Route/advisory separation: a ranked route carries no declared-intent advisory items, so the
        // advisory can never be mistaken for the executable slot.
        expect(typedRoute.advisoryFallback?.items ?? []).toEqual([]);
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
        expect(handoffContent).toContain('no computed candidate survived the guard');
        // no-survivor state surfaces the live focus as the numbered route — never empty
        expect(handoffContent).toMatch(/^\d+\.\s+\*\*issue-\d+\*\*: Current Release \/ Incident Focus/m);
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
                evidenceRefs   : ['#9601', 'approvedAt:2026-07-01T01:00:00.000Z'],
                findingClass   : 'DECISION_STARVED',
                grade          : 'verified-stall',
                motionPredicate: 'PR merges or loses approval',
                sourceFidelity : 'verified',
                subject        : {number: 9601, title: 'Approved PR', type: 'PR'},
                waitingSince   : '2026-07-01T01:00:00.000Z'
            },
            {
                evidenceRefs   : ['#9505', 'blockedBy:9506'],
                findingClass   : 'STALE_DEFER',
                grade          : 'candidate-stall',
                motionPredicate: 'defer exit satisfied',
                sourceFidelity : 'candidate',
                subject        : {number: 9505, title: 'Resolved blocker defer', type: 'ISSUE'},
                waitingSince   : '2026-05-15T00:00:00.000Z'
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

        // Deterministic, realistic-shaped ids: these fixtures are this test's positive subjects
        // and must FLOW through scoring. The routing layer's provenance guard is STAMP-based
        // (`isTestFixture`) and performs no id-pattern exclusion — the fail-loud isolation gate
        // in beforeAll is the only thing keeping these out of any live graph, by design.
        const openId   = 'discussion-91001';
        const closedId = 'discussion-91002';
        const issueId  = 'issue-91003';

        GraphService.upsertNode({
            id        : openId,
            type      : 'DISCUSSION',
            name      : 'Open Discussion Fixture',
            state     : 'OPEN',
            properties: {
                state                          : 'OPEN',
                title                          : 'Open Discussion Fixture',
                routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
                routingDisposition             : 'active',
                routingDispositionReason       : 'explicit-active-marker',
                routingDispositionEvidence     : ['marker:CONVERGING']
            }
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

    test('buildDeclaredIntentFallback surfaces unblocked open-epic leaves with the provenance line; drops blocked + non-actionable (#14659)', () => {
        // An open epic, one actionable UNBLOCKED leaf under it, one BLOCKED leaf, and the open blocker.
        GraphService.upsertNode({id: 'issue-900', type: 'ISSUE', properties: {state: 'OPEN', labels: ['epic', 'ai'], title: 'Convergence epic'}});
        GraphService.upsertNode({id: 'issue-901', type: 'ISSUE', properties: {state: 'OPEN', labels: ['bug', 'ai'], title: 'Actionable tree leaf', createdAt: '2026-07-04T02:00:00Z'}});
        GraphService.upsertNode({id: 'issue-902', type: 'ISSUE', properties: {state: 'OPEN', labels: ['bug', 'ai'], title: 'Blocked leaf'}});
        GraphService.upsertNode({id: 'issue-903', type: 'ISSUE', properties: {state: 'OPEN', labels: ['bug', 'ai'], title: 'Open blocker'}});
        GraphService.linkNodes('issue-900', 'issue-901', 'PARENT_OF', 1.0);
        GraphService.linkNodes('issue-900', 'issue-902', 'PARENT_OF', 1.0);
        GraphService.linkNodes('issue-903', 'issue-902', 'BLOCKS', 1);

        const md = GoldenPathSynthesizer.constructor.buildDeclaredIntentFallback();

        expect(md).toContain('fallback: declared-intent (frontier empty)'); // provenance line — never masquerades as semantic
        expect(md).toContain('#901');                                        // actionable unblocked open-epic leaf surfaced
        expect(md).not.toContain('#902');                                    // blocked → dropped
        expect(md).not.toContain('#900');                                    // epic → non-actionable, not a leaf
    });

    test('buildDeclaredIntentFallback surfaces COLD-CACHE leaves — read straight from SQLite, no in-memory dependency (#14659)', () => {
        // TRUE cold cache: insert the rows directly into SQLite so the in-memory node store NEVER sees them
        // (the fresh-boot / REM-starved condition this fallback rescues). A get-before-load implementation
        // drops these — its `nodes.get(id)` returns null; the SQLite-sourced fallback must still surface the leaf.
        const db      = GraphService.db.storage.db,
              putNode = (id, labels) => db.prepare('INSERT OR REPLACE INTO Nodes (id, user_id, data) VALUES (?, ?, ?)')
                  .run(id, null, JSON.stringify({id, type: 'ISSUE', properties: {state: 'OPEN', labels}}));

        putNode('issue-910', ['epic', 'ai']);
        putNode('issue-911', ['bug', 'ai']);
        db.prepare('INSERT OR REPLACE INTO Edges (id, user_id, source, target, type, data) VALUES (?, ?, ?, ?, ?, ?)')
            .run('edge-910-911', null, 'issue-910', 'issue-911', 'PARENT_OF', JSON.stringify({properties: {weight: 1.0}}));

        const md = GoldenPathSynthesizer.constructor.buildDeclaredIntentFallback();

        expect(md).toContain('#911');                                        // surfaced from SQLite despite the cold node cache
        expect(md).toContain('fallback: declared-intent (frontier empty)');
    });

    test('buildDeclaredIntentFallback attributes the MEASURED REM cause from caller-supplied pipeline state (#14883)', () => {
        GraphService.upsertNode({id: 'issue-920', type: 'ISSUE', properties: {state: 'OPEN', labels: ['epic', 'ai'], title: 'Epic'}});
        GraphService.upsertNode({id: 'issue-921', type: 'ISSUE', properties: {state: 'OPEN', labels: ['bug', 'ai'], title: 'Leaf', createdAt: '2026-07-04T02:00:00Z'}});
        GraphService.linkNodes('issue-920', 'issue-921', 'PARENT_OF', 1.0);

        // Genuine REM stall — undigested backlog, no recent cycle → REM_STALLED (not the old "REM-starved" guess).
        const stalled = GoldenPathSynthesizer.constructor.buildDeclaredIntentFallback({undigested: 40, digested: 100, recentCycles: []});
        expect(stalled).toContain('REM consolidation stalled');
        expect(stalled).not.toContain('REM-starved');

        // Healthy digestion + recent cycles but an empty anchor → FRONTIER_UNANCHORED (the daemon-off case).
        const unanchored = GoldenPathSynthesizer.constructor.buildDeclaredIntentFallback({undigested: 3, digested: 100, recentCycles: [{outcome: 'completed'}]});
        expect(unanchored).toContain('frontier unanchored');

        // No measured state (fetch failed) → honest UNATTRIBUTED, never a guessed mechanism.
        const noState = GoldenPathSynthesizer.constructor.buildDeclaredIntentFallback();
        expect(noState).toContain('unattributed');
        expect(noState).not.toContain('REM-starved');

        // Diagnostic-envelope safety: a FAILED axis projects a fallback 0/[] plus an axisErrors marker,
        // which must NOT become an asserted cause. A failed `digested` axis (fallback 0) reads as unknown
        // → UNATTRIBUTED, never a confident COLD_START.
        const degradedDigested = GoldenPathSynthesizer.constructor.buildDeclaredIntentFallback(
            {digested: 0, undigested: 0, recentCycles: [{outcome: 'completed'}], axisErrors: {digested: 'timeout'}});
        expect(degradedDigested).toContain('unattributed');
        expect(degradedDigested).not.toContain('cold-start');

        // A failed recent-cycle read (fallback []) must NOT produce REM_STALLED from the sentinel; the
        // measured digested backlog still resolves it honestly to FRONTIER_UNANCHORED.
        const degradedCycles = GoldenPathSynthesizer.constructor.buildDeclaredIntentFallback(
            {undigested: 40, digested: 100, recentCycles: [], axisErrors: {recentCycles: 'read-failed'}});
        expect(degradedCycles).not.toContain('REM consolidation stalled');
        expect(degradedCycles).toContain('frontier unanchored');
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

    test('buildRouteAttributionRecords records armingReasons (guard causes only) vs candidateReasons (full set), per-node labels, stamped at (#15057 / RA-2 #15060)', () => {

        const contradiction = {
            blockedNodes: [
                {node: {id: 'issue-200', properties: {labels: ['documentation', 'ai']}}},
                {node: {id: 'issue-201', properties: {labels: ['blog']}}}
            ],
            focusCandidates: [
                {number: 100, reasons: ['incident', 'fresh-updated']},
                {number: 101, reasons: ['incident', 'prio-zero']}
            ]
        };

        const records = Synthesizer.buildRouteAttributionRecords(contradiction, 4242);

        expect(records.map(r => r.blockedNodeId)).toEqual(['issue-200', 'issue-201']);
        // armingReasons = ONLY the reasons that armed the guard (incident/prio-zero); the incidental
        // 'fresh-updated' is NEVER attributed as a cause — candidateReasons keeps the full diagnostic set.
        expect(records[0].armingReasons).toEqual(['incident', 'prio-zero']);
        expect(records[0].candidateReasons).toEqual(['incident', 'fresh-updated', 'prio-zero']);
        expect(records[1].armingReasons).toEqual(['incident', 'prio-zero']);
        expect(records[1].candidateReasons).toEqual(['incident', 'fresh-updated', 'prio-zero']);
        // every record is stamped with the injected clock; no exclusion-label field (guard-blocked = actionable)
        expect(records.every(r => r.at === 4242)).toBe(true);
        expect(records.every(r => !('exclusionLabels' in r))).toBe(true);
    });

    test('buildRouteAttributionRecords is empty for no contradiction, and drops id-less nodes (#15057)', () => {

        expect(Synthesizer.buildRouteAttributionRecords(null, 1)).toEqual([]);
        expect(Synthesizer.buildRouteAttributionRecords({blockedNodes: [], focusCandidates: []}, 1)).toEqual([]);

        const records = Synthesizer.buildRouteAttributionRecords({
            blockedNodes: [
                {node: {id: 'issue-1', properties: {}}},
                {node: {properties: {}}},   // no id → dropped
                {node: {id: '', properties: {}}}  // empty id → dropped
            ],
            focusCandidates: [{number: 9, reasons: ['incident']}]
        }, 7);

        expect(records.map(r => r.blockedNodeId)).toEqual(['issue-1']);
    });

    test('recordRouteAttribution is a no-op that never throws when there is no contradiction (fail-safe, no ledger touch) (#15057)', async () => {
        // buildRouteAttributionRecords returns [] → early return BEFORE any config read or disk write.
        await expect(Synthesizer.recordRouteAttribution(null, new Date())).resolves.toBeUndefined();
        await expect(Synthesizer.recordRouteAttribution({blockedNodes: [], focusCandidates: []}, 123)).resolves.toBeUndefined();
    });

    test('recordRouteAttribution writes guard-filtered records to the INJECTED ledger dir — partial-block + no-survivor, hermetic (#15057 / RA-3 #15060)', async () => {
        const fs   = await import('fs/promises'),
              os   = await import('os'),
              path = await import('path');
        const {readRouteAttributionLedger} = await import('../../../../../../ai/services/graph/routeAttributionLedgerStore.mjs');

        // Per-test temporary ledger boundary — recordRouteAttribution takes the dir as a param (no aiConfig
        // read of its own), so nothing touches the production `.neo-ai-data` default: the records provably land
        // in THIS temp dir. Restored in finally.
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ra-emit-'));
        try {
            // Partial-block: one blocked content candidate under incident + an incidental co-reason.
            await Synthesizer.recordRouteAttribution({
                blockedNodes   : [{node: {id: 'issue-200', properties: {labels: ['documentation']}}}],
                focusCandidates: [{number: 100, reasons: ['incident', 'fresh-updated']}]
            }, 1000, {dir, maxEvents: 100, triggerBytes: 65536});

            // No-survivor: two blocked candidates under a prio-zero focus.
            await Synthesizer.recordRouteAttribution({
                blockedNodes   : [{node: {id: 'issue-300', properties: {}}}, {node: {id: 'issue-301', properties: {}}}],
                focusCandidates: [{number: 400, reasons: ['prio-zero']}]
            }, 2000, {dir, maxEvents: 100, triggerBytes: 65536});

            const records = await readRouteAttributionLedger({dir});
            expect(records.map(r => r.blockedNodeId)).toEqual(['issue-200', 'issue-300', 'issue-301']);
            // arming reasons attributed correctly — the incidental 'fresh-updated' is excluded
            expect(records[0].armingReasons).toEqual(['incident']);
            expect(records[0].candidateReasons).toEqual(['incident', 'fresh-updated']);
            expect(records[1].armingReasons).toEqual(['prio-zero']);
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    test('recordRouteAttribution is fail-open — a real write failure does not throw, so synthesis is unaffected (#15057 / RA-3)', async () => {
        const fs   = await import('fs/promises'),
              os   = await import('os'),
              path = await import('path');

        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ra-fail-'));
        try {
            // Point the ledger dir UNDER a regular file → mkdir throws ENOTDIR → the write must be swallowed.
            const filePath = path.join(tmp, 'blocker');
            await fs.writeFile(filePath, 'x');

            await expect(Synthesizer.recordRouteAttribution({
                blockedNodes   : [{node: {id: 'issue-1', properties: {}}}],
                focusCandidates: [{number: 1, reasons: ['incident']}]
            }, 1, {dir: path.join(filePath, 'nested'), maxEvents: 100, triggerBytes: 65536})).resolves.toBeUndefined();
        } finally {
            await fs.rm(tmp, {recursive: true, force: true});
        }
    });

    test('under UNIT_TEST_MODE the synthesis ledger dir resolves to a TEST path — synthesis never writes the prod .neo-ai-data ledger (#15057 / RA-3 #15060)', async () => {
        const {default: aiConfig} = await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs');
        // synthesizeGoldenPath reads aiConfig.goldenPathRouteAttributionLedgerDir at its use site; the config
        // formula resolves it to the OS-temp test dir under UNIT_TEST_MODE, so the synthesis specs that trigger
        // the fail-open emit never write the tracked production `.neo-ai-data` ledger.
        expect(aiConfig.goldenPathRouteAttributionLedgerDir).not.toContain('.neo-ai-data');
        expect(aiConfig.goldenPathRouteAttributionLedgerDir).toContain('route-attribution-test');
    });

    test('buildTypeGateRejectionRecords stamps nodeId + exclusion bucket + stage + at, drops id-less, defaults a non-array bucket to [] (#15057 AC3)', () => {
        const records = Synthesizer.buildTypeGateRejectionRecords([
            {nodeId: 'issue-10', rejectionBucket: ['epic']},
            {nodeId: 'issue-11', rejectionBucket: ['not-code-ready', 'ai-generated']},
            {rejectionBucket: ['epic']},              // no nodeId → dropped
            {nodeId: '', rejectionBucket: ['epic']},   // empty nodeId → dropped
            {nodeId: 'issue-12', rejectionBucket: 'epic'}, // non-array bucket → []
            {nodeId: 'discussion-13', rejectionBucket: ['terminal'], stage: 'discussion-liveness-gate'},
            {nodeId: 'issue-14', rejectionBucket: ['epic'], stage: 'unknown-stage'}
        ], 4242);

        expect(records.map(r => r.nodeId)).toEqual(['issue-10', 'issue-11', 'issue-12', 'discussion-13']);
        expect(records[0]).toEqual({nodeId: 'issue-10', rejectionBucket: ['epic'], stage: 'actionability-type-gate', at: 4242});
        expect(records[2].rejectionBucket).toEqual([]);        // non-array bucket normalized
        expect(records[3].stage).toBe('discussion-liveness-gate');
        expect(records.every(r => r.at === 4242)).toBe(true);
    });

    test('buildTypeGateRejectionRecords is empty for no rejections / a non-array input (#15057 AC3)', () => {
        expect(Synthesizer.buildTypeGateRejectionRecords([], 1)).toEqual([]);
        expect(Synthesizer.buildTypeGateRejectionRecords(null, 1)).toEqual([]);
        expect(Synthesizer.buildTypeGateRejectionRecords(undefined, 1)).toEqual([]);
    });

    test('recordTypeGateRejections is a no-op that never throws when nothing was rejected (fail-safe, no ledger touch) (#15057 AC3)', async () => {
        await expect(Synthesizer.recordTypeGateRejections([], new Date())).resolves.toBeUndefined();
        await expect(Synthesizer.recordTypeGateRejections(null, 123)).resolves.toBeUndefined();
    });

    test('recordTypeGateRejections writes rejection records to the INJECTED ledger dir as a SIBLING file, hermetic (#15057 AC3)', async () => {
        const fs   = await import('fs/promises'),
              os   = await import('os'),
              path = await import('path');
        const {readTypeGateRejectionLedger} = await import('../../../../../../ai/services/graph/typeGateRejectionLedgerStore.mjs');
        const {readRouteAttributionLedger}  = await import('../../../../../../ai/services/graph/routeAttributionLedgerStore.mjs');

        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-emit-'));
        try {
            await Synthesizer.recordTypeGateRejections([
                {nodeId: 'issue-epic', rejectionBucket: ['epic']},
                {nodeId: 'issue-draft', rejectionBucket: ['not-code-ready']}
            ], 1000, {dir, maxEvents: 100, triggerBytes: 65536});

            const records = await readTypeGateRejectionLedger({dir});
            expect(records.map(r => r.nodeId)).toEqual(['issue-epic', 'issue-draft']);
            expect(records[0]).toMatchObject({rejectionBucket: ['epic'], stage: 'actionability-type-gate', at: 1000});
            // the type-gate producer writes a SIBLING file — the route-attribution ledger stays empty
            expect(await readRouteAttributionLedger({dir})).toEqual([]);
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    test('recordTypeGateRejections is fail-open — a real write failure does not throw, so synthesis is unaffected (#15057 AC3)', async () => {
        const fs   = await import('fs/promises'),
              os   = await import('os'),
              path = await import('path');

        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-fail-'));
        try {
            const filePath = path.join(tmp, 'blocker');
            await fs.writeFile(filePath, 'x'); // ledger dir UNDER a regular file → mkdir ENOTDIR → swallowed

            await expect(Synthesizer.recordTypeGateRejections(
                [{nodeId: 'issue-1', rejectionBucket: ['epic']}],
                1, {dir: path.join(filePath, 'nested'), maxEvents: 100, triggerBytes: 65536}
            )).resolves.toBeUndefined();
        } finally {
            await fs.rm(tmp, {recursive: true, force: true});
        }
    });
});
