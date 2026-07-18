import {setup} from '../../../../setup.mjs';

const appName = 'TemporalSummaryAggregationServiceTest';

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

// Test-side entry-point bootstrap: Neo + core/_export populate `globalThis.Neo` before the dynamic
// service import below (the class file no longer imports Neo — the class+wrapper split).
import Neo       from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';

import {test, expect} from '@playwright/test';

test.describe('Neo.ai.daemons.TemporalSummaryAggregationService', () => {
    let TemporalSummaryAggregationService, logger, StorageRouter, GraphService, originals = {};

    test.beforeAll(async () => {
        TemporalSummaryAggregationService = (await import('../../../../../../ai/daemons/temporal-summary/TemporalSummaryAggregationService.mjs')).default;
        logger                            = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;
        StorageRouter                     = (await import('../../../../../../ai/services.mjs')).Memory_StorageRouter;
        GraphService                      = (await import('../../../../../../ai/services.mjs')).Memory_GraphService;

        originals = {
            info                        : logger.info,
            debug                       : logger.debug,
            error                       : logger.error,
            getTemporalSummaryCollection: StorageRouter.getTemporalSummaryCollection,
            getSummaryCollection        : StorageRouter.getSummaryCollection,
            upsertNode                  : GraphService.upsertNode,
            removeNodes                 : GraphService.removeNodes
        };
        logger.info  = () => {};
        logger.debug = () => {};
        logger.error = () => {};
        // default no-ops so no test hits the real graph writes; the persist/prune tests override to capture
        GraphService.upsertNode  = () => {};
        GraphService.removeNodes = () => {}
    });

    test.afterAll(() => {
        logger.info            = originals.info;
        logger.debug           = originals.debug;
        logger.error            = originals.error;
        GraphService.upsertNode  = originals.upsertNode;
        GraphService.removeNodes = originals.removeNodes
    });

    test.afterEach(() => {
        StorageRouter.getTemporalSummaryCollection = originals.getTemporalSummaryCollection;
        StorageRouter.getSummaryCollection         = originals.getSummaryCollection;

        // Drop instance-method seam overrides so the real prototype methods resurface for the next test.
        for (const seam of ['collectPendingWindows', 'persistTemporalRecord', 'pruneOldVersions', 'runCycle', 'resolveAggregationAnchor', 'dailyWindowCount', 'sessionWindowCount', 'fetchWindowSources', 'fetchDevCommits', 'fetchSandboxesGraduated', 'extractGraduationActions', 'fetchAdrsLanded', 'fetchSessions', 'fetchMergedPrs', 'readContentRecords', 'execCommand']) {
            delete TemporalSummaryAggregationService[seam]
        }
    });

    test('persistTemporalRecord upserts the Chroma row AND mints the SUMMARY_DAILY graph node by its doc id', async () => {
        const upserts = [], nodes = [];

        StorageRouter.getTemporalSummaryCollection = async () => ({upsert: async args => { upserts.push(args) }});
        GraphService.upsertNode                    = node => { nodes.push(node) };

        const record = {
            id            : 'temporal-summary-daily-unified-2026-07-05-v1',
            metadata      : {level: 'daily', partition: 'unified', windowStart: '2026-07-05T00:00:00.000Z', windowEnd: '2026-07-06T00:00:00.000Z', version: 1},
            velocityFields: {mergedPrs: 3}
        };

        await TemporalSummaryAggregationService.persistTemporalRecord(record);

        // Chroma side — the query contract + payload keyed by the doc id
        expect(upserts).toHaveLength(1);
        expect(upserts[0].ids).toEqual([record.id]);
        expect(upserts[0].metadatas).toEqual([record.metadata]);
        expect(JSON.parse(upserts[0].documents[0])).toEqual({mergedPrs: 3});

        // graph side — the durable SUMMARY_DAILY label, same doc id, linked back to the vector row
        expect(nodes).toHaveLength(1);
        expect(nodes[0]).toMatchObject({id: record.id, type: 'SUMMARY_DAILY', name: record.id, semanticVectorId: record.id});
        expect(nodes[0].properties).toEqual(record.metadata)
    });

    test('persistTemporalRecord mints SUMMARY_SESSION for L1 and writes NOTHING to EITHER store for a non-durable tier', async () => {
        const upserts = [], nodes = [];

        StorageRouter.getTemporalSummaryCollection = async () => ({upsert: async args => { upserts.push(args) }});
        GraphService.upsertNode                    = node => { nodes.push(node) };

        await TemporalSummaryAggregationService.persistTemporalRecord({
            id            : 'temporal-summary-session-neo-opus-ada-2026-07-05-14-v1',
            metadata      : {level: 'session', partition: '@neo-opus-ada', windowStart: '2026-07-05T14:00:00.000Z', windowEnd: '2026-07-05T15:00:00.000Z', version: 1},
            velocityFields: {}
        });

        expect(nodes.map(node => node.type)).toEqual(['SUMMARY_SESSION']);
        expect(upserts).toHaveLength(1);

        upserts.length = 0;
        nodes.length   = 0;

        // a non-durable (synthesis-only) tier must NOT breach the durable/dynamic boundary — the level gate runs
        // BEFORE the Chroma upsert, so a weekly record produces ZERO Chroma writes AND zero graph nodes
        await TemporalSummaryAggregationService.persistTemporalRecord({
            id            : 'temporal-summary-weekly-unified-2026-07-05-v1',
            metadata      : {level: 'weekly', partition: 'unified', windowStart: '2026-07-05T00:00:00.000Z', windowEnd: '2026-07-12T00:00:00.000Z', version: 1},
            velocityFields: {}
        });

        expect(nodes).toHaveLength(0);
        expect(upserts).toHaveLength(0)
    });

    test('pruneOldVersions keeps the newest retained contract-versions and deletes the older overflow from both stores', async () => {
        const deletedFromChroma = [], removedFromGraph = [];

        StorageRouter.getTemporalSummaryCollection = async () => ({
            // five versions persisted for this window+track (a contract that bumped past the retained bound of 3)
            get: async () => ({
                ids      : ['id-v5', 'id-v4', 'id-v3', 'id-v2', 'id-v1'],
                metadatas: [{version: 5}, {version: 4}, {version: 3}, {version: 2}, {version: 1}]
            }),
            delete: async ({ids}) => { deletedFromChroma.push(...ids) }
        });
        GraphService.removeNodes = ids => { removedFromGraph.push(...ids) };

        // current version 5 > retained 3 → prune the two oldest ({v2, v1}) from BOTH stores, by the same ids
        await TemporalSummaryAggregationService.pruneOldVersions({
            level: 'daily', partition: 'unified', windowStart: '2026-07-05T00:00:00.000Z', windowEnd: '2026-07-06T00:00:00.000Z', version: 5
        });

        expect(deletedFromChroma).toEqual(['id-v2', 'id-v1']);
        expect(removedFromGraph).toEqual(['id-v2', 'id-v1'])
    });

    test('pruneOldVersions deletes the graph node BEFORE the Chroma doc, staying retry-safe on a Chroma-delete failure', async () => {
        const order = [];

        StorageRouter.getTemporalSummaryCollection = async () => ({
            // five versions → overflow past the retained bound, so there is something to prune
            get   : async () => ({ids: ['id-v5', 'id-v4', 'id-v3', 'id-v2', 'id-v1'], metadatas: [{version: 5}, {version: 4}, {version: 3}, {version: 2}, {version: 1}]}),
            delete: async () => { order.push('chroma'); throw new Error('chroma delete failed') }
        });
        GraphService.removeNodes = () => { order.push('graph') };

        // graph is deleted first; the Chroma delete then throws → the prune rejects (so the cycle retries) while the
        // version's Chroma doc — the "needs pruning" signal — is never left silently orphaned behind a dead node
        await expect(TemporalSummaryAggregationService.pruneOldVersions({
            level: 'daily', partition: 'unified', windowStart: '2026-07-05T00:00:00.000Z', windowEnd: '2026-07-06T00:00:00.000Z', version: 5
        })).rejects.toThrow('chroma delete failed');

        expect(order).toEqual(['graph', 'chroma'])
    });

    test('pruneOldVersions is a no-op (never queries) at the steady-state contract version', async () => {
        let queried = 0;

        StorageRouter.getTemporalSummaryCollection = async () => ({get: async () => { queried++; return {} }, delete: async () => {}});

        // version within the retained bound → overflow is impossible → the query is skipped entirely
        await TemporalSummaryAggregationService.pruneOldVersions({
            level: 'daily', partition: 'unified', windowStart: '2026-07-05T00:00:00.000Z', windowEnd: '2026-07-06T00:00:00.000Z', version: 1
        });

        expect(queried).toBe(0)
    });

    test('readContentRecords fails loud on a missing sync root — a broken checkout is not an empty window', () => {
        expect(() => TemporalSummaryAggregationService.readContentRecords('no-such-type'))
            .toThrow(/missing synced content root/)
    });

    test('fetchMergedPrs counts only MERGED records whose mergedAt lands in the half-open window', async () => {
        TemporalSummaryAggregationService.readContentRecords = type => {
            expect(type).toBe('pulls');

            return [
                {frontmatter: {number: 1, state: 'MERGED', mergedAt: '2026-07-05T10:00:00Z'}, body: ''},
                {frontmatter: {number: 2, state: 'MERGED', mergedAt: '2026-07-06T00:00:00Z'}, body: ''},  // windowEnd is exclusive
                {frontmatter: {number: 3, state: 'CLOSED', mergedAt: null},                   body: ''},  // closed, never merged
                {frontmatter: {number: 4, state: 'OPEN',   mergedAt: null},                   body: ''},
                {frontmatter: {number: 5, state: 'MERGED', mergedAt: '2026-07-04T23:59:59Z'}, body: ''}   // before windowStart
            ]
        };

        const merged = await TemporalSummaryAggregationService.fetchMergedPrs({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        expect(merged.map(pr => pr.number)).toEqual([1])
    });

    test('fetchSandboxesGraduated counts only marker-LEADING actions in dated comments — rejects prose/quote/original-post, dedupes, event-windowed', async () => {
        let execCalls = 0;

        TemporalSummaryAggregationService.execCommand        = () => { execCalls++; return '' };
        TemporalSummaryAggregationService.readContentRecords = type => {
            expect(type).toBe('discussions');

            return [
                // two real actions — the marker LEADS its line (heading, then bold+backtick wrappers), both in dated
                // in-window comments. closedAt is deliberately OUT of window (Aug): proves event time, not close time
                {
                    frontmatter: {number: 10, conversationComplete: true, createdAt: '2026-06-01T00:00:00Z', closedAt: '2026-08-01T00:00:00Z'},
                    body       : [
                        '## Comments',
                        '### `@neo-gpt` commented on 2026-07-05T10:00:00Z',
                        '## [GRADUATED_TO_TICKET: #900] — phase-1 graduated',
                        '### `@neo-opus-vega` commented on 2026-07-05T11:00:00Z',
                        '**`[GRADUATED_TO_TICKET: Epic #901]`** — §6.7 executed'
                    ].join('\n')
                },
                // a ticket-bearing marker INLINE in prose (rejected) + a real leading action + a later
                // BLOCKQUOTE quoting that same action → the action counts exactly once (dedupe + blockquote)
                {
                    frontmatter: {number: 11, conversationComplete: true, createdAt: '2026-06-01T00:00:00Z', closedAt: null},
                    body       : [
                        '### `@neo-gpt` commented on 2026-07-05T09:00:00Z',
                        'we should do [GRADUATED_TO_TICKET: #902] once OQ3 lands',
                        '## [GRADUATED_TO_TICKET: #903] — graduated',
                        '### `@neo-opus-ada` commented on 2026-07-05T12:00:00Z',
                        '> ## [GRADUATED_TO_TICKET: #903] — graduated'
                    ].join('\n')
                },
                // marker LEADS its line but sits in the ORIGINAL POST (no dated comment) → fail closed: createdAt is
                // creation time, not the marker's edit time, so it is not a proxy — even though createdAt is in-window
                {
                    frontmatter: {number: 12, conversationComplete: true, createdAt: '2026-07-05T05:00:00Z', closedAt: null},
                    body       : '## [GRADUATED_TO_TICKET: #904] — graduated\n\n## Concept\n…'
                },
                // real leading action but its comment event time is OUT of window → rejected
                {
                    frontmatter: {number: 13, conversationComplete: true, createdAt: '2026-06-01T00:00:00Z', closedAt: null},
                    body       : '### `@y` commented on 2026-07-09T00:00:00Z\n## [GRADUATED_TO_TICKET: #905] — graduated'
                }
            ]
        };

        const graduated = await TemporalSummaryAggregationService.fetchSandboxesGraduated({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        // no live `gh api graphql` page — the corpus is complete
        expect(execCalls).toBe(0);
        // the three leading actions in in-window dated comments survive (despite the Aug close on the first record;
        // the third's quote is deduped); the inline-prose marker, the original-post marker (no event time), and the
        // out-of-window action are all rejected
        expect(graduated.map(g => g.ticket)).toEqual(['#900', '#901', '#903']);
        expect(graduated.map(g => g.at)).toEqual(['2026-07-05T10:00:00Z', '2026-07-05T11:00:00Z', '2026-07-05T09:00:00Z']);
        expect(graduated.map(g => g.ref)).toEqual(['discussion #10', 'discussion #10', 'discussion #11'])
    });

    test('fetchSandboxesGraduated binds a REPLY marker to the reply event time, and rejects a ~~~-fenced marker', async () => {
        TemporalSummaryAggregationService.execCommand        = () => '';
        TemporalSummaryAggregationService.readContentRecords = () => [
            {
                frontmatter: {number: 20, conversationComplete: true, createdAt: '2026-06-01T00:00:00Z', closedAt: null},
                body       : [
                    '### `@neo-gpt` commented on 2026-07-05T08:00:00Z',
                    'plain discussion prose',
                    // a marker inside a REPLY binds to the reply event time (10:00), NOT the parent comment's (08:00)
                    '#### Reply depth=1 by `@neo-opus-ada` on 2026-07-05T10:00:00Z',
                    '## [GRADUATED_TO_TICKET: #920] — graduated in a reply',
                    // a marker inside a ~~~ fence is a code example, never an action → rejected
                    '### `@neo-opus-vega` commented on 2026-07-05T11:00:00Z',
                    '~~~',
                    '## [GRADUATED_TO_TICKET: #921] — this is a fenced sample',
                    '~~~'
                ].join('\n')
            }
        ];

        const graduated = await TemporalSummaryAggregationService.fetchSandboxesGraduated({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        // only the reply action survives, stamped with the REPLY's own event time (10:00, not the comment's 08:00);
        // the ~~~-fenced marker is rejected exactly like a ```-fenced one
        expect(graduated.map(g => g.ticket)).toEqual(['#920']);
        expect(graduated.map(g => g.at)).toEqual(['2026-07-05T10:00:00Z'])
    });

    test('fetchSandboxesGraduated rejects incomplete and legacy-unknown mirrors before counting', async () => {
        TemporalSummaryAggregationService.readContentRecords = () => [
            {frontmatter: {number: 30, conversationComplete: false}, body: ''},
            {frontmatter: {number: 31}, body: ''}
        ];

        await expect(TemporalSummaryAggregationService.fetchSandboxesGraduated({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        })).rejects.toThrow(/#30, #31/)
    });

    test('extractGraduationActions closes a fence only with the matching delimiter and sufficient length', () => {
        const actions = TemporalSummaryAggregationService.extractGraduationActions({
            frontmatter: {number: 32},
            body       : [
                '### `@neo-gpt` commented on 2026-07-05T10:00:00Z',
                '````js',
                '~~~',
                '```',
                '## [GRADUATED_TO_TICKET: #930] — still fenced',
                '````',
                '## [GRADUATED_TO_TICKET: #931] — real action'
            ].join('\n')
        });

        expect(actions.map(action => action.ticket)).toEqual(['#931'])
    });

    test('fetchSessions binds sessions to the summary collection over a bounded half-open window', async () => {
        const queries = [];

        StorageRouter.getSummaryCollection = async () => ({
            get: async args => {
                queries.push(args);

                return {metadatas: [
                    {sessionId: 's1', impact: 95, sourceAgentIdentities: '@neo-opus-ada,@neo-gpt'},
                    {sessionId: 's2', impact: 10, sourceAgentIdentities: '@neo-opus-ada'},
                    {sessionId: 's3', impact: 40, sourceAgentIdentities: ''}
                ]}
            }
        });

        const sessions = await TemporalSummaryAggregationService.fetchSessions({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        // the half-open [start, end) bound is pushed into the store query — a bounded read, not a full scan
        expect(queries).toHaveLength(1);
        expect(queries[0].where).toEqual({$and: [
            {timestamp: {$gte: Date.parse('2026-07-05T00:00:00.000Z')}},
            {timestamp: {$lt : Date.parse('2026-07-06T00:00:00.000Z')}}
        ]});

        // participatingAgents is the per-agent partition key list — a session keeps ALL of its participants
        expect(sessions[0].agentIdentities).toEqual(['@neo-opus-ada', '@neo-gpt']);
        expect(sessions[1].agentIdentities).toEqual(['@neo-opus-ada']);
        // an unattributed session survives as a row (it still counts toward the unified window) with no identities
        expect(sessions[2].agentIdentities).toEqual([]);
        expect(sessions[0].impact).toBe(95)
    });

    test('fetchSessions attributes on canonical sourceAgentIdentities, never the display participatingAgents', async () => {
        StorageRouter.getSummaryCollection = async () => ({
            get: async () => ({metadatas: [{
                sessionId: 's1',
                impact   : 95,
                // real shapes observed in the live summary collection — caller-declared free text
                participatingAgents  : 'Gemini 3.1 Pro (Antigravity),neo-gemini-pro,@neo-gemini-pro',
                sourceAgentIdentities: '@neo-gemini-pro'
            }]})
        });

        const [session] = await TemporalSummaryAggregationService.fetchSessions({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        // one agent, one canonical identity — the display field spells it three ways, and partitioning on it
        // would credit the same agent under several keys while silently dropping the unprefixed spellings
        expect(session.agentIdentities).toEqual(['@neo-gemini-pro'])
    });

    test('fetchSessions yields no per-agent identity when the session sources carry none', async () => {
        StorageRouter.getSummaryCollection = async () => ({
            get: async () => ({metadatas: [
                {sessionId: 's1', impact: 95, participatingAgents: 'Claude Opus 4.7 (Claude Code)', sourceAgentIdentities: ''}
            ]})
        });

        const [session] = await TemporalSummaryAggregationService.fetchSessions({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        // honest absence: a pre-provenance session gets no per-agent track, and still counts once on unified
        expect(session.agentIdentities).toEqual([]);
        expect(session.impact).toBe(95)
    });

    test('runCycle persists the unified track plus one record per agent seen in the window', async () => {
        const persisted = [];

        TemporalSummaryAggregationService.collectPendingWindows = async () => [{
            level      : 'daily',
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z',
            sources    : {
                mergedPrs: [{n: 1}, {n: 2}],
                sessions : [
                    {agentIdentities: ['@neo-opus-ada'], impact: 95},
                    {agentIdentities: ['@neo-gpt'],      impact: 10}
                ]
            }
        }];
        TemporalSummaryAggregationService.persistTemporalRecord = async record => { persisted.push(record) };

        await TemporalSummaryAggregationService.runCycle();

        expect(persisted.map(record => record.metadata.partition)).toEqual(['unified', '@neo-gpt', '@neo-opus-ada']);

        const [unified, gpt, ada] = persisted;

        // the window fact is attributed exactly once — on the unified track
        expect(unified.velocityFields.mergedPrs).toBe(2);
        expect(ada.velocityFields.mergedPrs).toBeNull();
        expect(gpt.velocityFields.mergedPrs).toBeNull();

        // each per-agent track carries only its own attributable measurements
        expect(ada.velocityFields.highImpactSessions).toBe(1);
        expect(gpt.velocityFields.highImpactSessions).toBe(0);
        expect(ada.velocityFields.sessionsPerAgent).toEqual({'@neo-opus-ada': 1})
    });

    test('runCycle writes the unified track alone when no session source attributes the window', async () => {
        const persisted = [];

        TemporalSummaryAggregationService.collectPendingWindows = async () => [{
            level      : 'daily',
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z',
            sources    : {devCommits: [{sha: 'a'}]}   // sessions source not yet bound
        }];
        TemporalSummaryAggregationService.persistTemporalRecord = async record => { persisted.push(record) };

        await TemporalSummaryAggregationService.runCycle();

        // no per-agent record the lane cannot attribute
        expect(persisted).toHaveLength(1);
        expect(persisted[0].metadata.partition).toBe('unified')
    });

    test('fetchWindowSources fails closed when one source throws — a partial-source failure aborts the window, never half-written', async () => {
        TemporalSummaryAggregationService.fetchMergedPrs          = async () => { throw new Error('git log failed') };
        TemporalSummaryAggregationService.fetchDevCommits         = async () => [];
        TemporalSummaryAggregationService.fetchAdrsLanded         = async () => [];
        TemporalSummaryAggregationService.fetchSandboxesGraduated = async () => [];
        TemporalSummaryAggregationService.fetchSessions           = async () => [];

        // one failing source rejects the whole window-source read — the engine never folds a record missing a
        // source (which would silently undercount a durable metric); the reject propagates up through runCycle
        await expect(TemporalSummaryAggregationService.fetchWindowSources({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        })).rejects.toThrow('git log failed')
    });

    test('collectPendingWindows plans both the L1 session + L2 daily trailing windows, each with fetched sources', async () => {
        TemporalSummaryAggregationService.resolveAggregationAnchor = () => '2026-07-06T12:30:00.000Z';
        TemporalSummaryAggregationService.sessionWindowCount       = () => 2;
        TemporalSummaryAggregationService.dailyWindowCount         = () => 2;
        TemporalSummaryAggregationService.fetchWindowSources       = async window => ({mergedPrs: [{w: window.windowStart}]});

        const
            windows = await TemporalSummaryAggregationService.collectPendingWindows(),
            session = windows.filter(window => window.level === 'session'),
            daily   = windows.filter(window => window.level === 'daily');

        // both durable tiers are planned, each window tagged so runCycle mints SUMMARY_SESSION / SUMMARY_DAILY
        expect(session).toHaveLength(2);
        expect(daily).toHaveLength(2);

        // L1: the trailing hourly windows, most-recent-first
        expect(session[0]).toMatchObject({level: 'session', windowStart: '2026-07-06T12:00:00.000Z', windowEnd: '2026-07-06T13:00:00.000Z'});
        expect(session[1].windowStart).toBe('2026-07-06T11:00:00.000Z');

        // L2: the trailing daily windows, most-recent-first
        expect(daily[0]).toMatchObject({level: 'daily', windowStart: '2026-07-06T00:00:00.000Z', windowEnd: '2026-07-07T00:00:00.000Z'});
        expect(daily[1].windowStart).toBe('2026-07-05T00:00:00.000Z');

        // every planned window gets its sources attached, keyed by its own start
        expect(session[0].sources.mergedPrs[0].w).toBe('2026-07-06T12:00:00.000Z');
        expect(daily[0].sources.mergedPrs[0].w).toBe('2026-07-06T00:00:00.000Z')
    });

    test('the trailing-window defaults: 24 hourly L1 windows (a day) + 7 daily L2 windows', () => {
        // real defaults (the wiring test above overrides them) — pin the L1 default a full day wide so the
        // 24 hourly windows nest exactly into one L2 day
        expect(TemporalSummaryAggregationService.sessionWindowCount()).toBe(24);
        expect(TemporalSummaryAggregationService.dailyWindowCount()).toBe(7)
    });

    test('fetchWindowSources binds devCommits to the dev first-parent window log', async () => {
        const commands = [];

        TemporalSummaryAggregationService.execCommand            = command => { commands.push(command); return '2026-07-05T06:00:00Z\tabc123\n2026-07-05T18:00:00Z\tdef456\n' };
        TemporalSummaryAggregationService.fetchSandboxesGraduated = async () => [];   // isolate the devCommits binding
        TemporalSummaryAggregationService.fetchAdrsLanded        = async () => [];
        TemporalSummaryAggregationService.fetchSessions          = async () => [];
        TemporalSummaryAggregationService.fetchMergedPrs         = async () => [];

        const sources = await TemporalSummaryAggregationService.fetchWindowSources({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        expect(sources.devCommits).toEqual([{sha: 'abc123'}, {sha: 'def456'}]);
        expect(commands[0]).toContain('git log --first-parent origin/dev');
        expect(commands[0]).toContain('--since="2026-07-05T00:00:00.000Z"');
        expect(commands[0]).toContain('--until="2026-07-06T00:00:00.000Z"');
        expect(commands[0]).toContain('--format=%cI%x09%H')
    });

    test('fetchWindowSources threads the graduated Discussions through from the synced corpus', async () => {
        TemporalSummaryAggregationService.fetchDevCommits    = async () => [];
        TemporalSummaryAggregationService.fetchAdrsLanded    = async () => [];
        TemporalSummaryAggregationService.fetchSessions      = async () => [];
        TemporalSummaryAggregationService.fetchMergedPrs     = async () => [];
        TemporalSummaryAggregationService.readContentRecords = () => [
            // real leading author-action in a dated in-window comment
            {frontmatter: {number: 10, conversationComplete: true, createdAt: '2026-06-01T00:00:00Z', closedAt: null}, body: '### `@x` commented on 2026-07-05T06:00:00.000Z\n## [GRADUATED_TO_TICKET: #810] — graduated'},
            {frontmatter: {number: 11, conversationComplete: true, createdAt: '2026-07-05T07:00:00.000Z', closedAt: null}, body: 'just an ordinary discussion'},
            // ticket-bearing marker inline in prose — rejected (not marker-leading)
            {frontmatter: {number: 12, conversationComplete: true, createdAt: '2026-07-05T08:00:00.000Z', closedAt: null}, body: '### `@y` commented on 2026-07-05T08:00:00Z\nwe will do [GRADUATED_TO_TICKET: #811] soon'}
        ];

        const sources = await TemporalSummaryAggregationService.fetchWindowSources({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        // only the exact in-window graduation action survives, stamped with its comment event time
        expect(sources.sandboxesGraduated).toEqual([
            {ref: 'discussion #10', ticket: '#810', at: '2026-07-05T06:00:00.000Z'}
        ])
    });

    test('fetchAdrsLanded binds to ADR records added under learn/agentos/decisions within the window', async () => {
        TemporalSummaryAggregationService.fetchDevCommits         = async () => [];
        TemporalSummaryAggregationService.fetchSandboxesGraduated = async () => [];
        TemporalSummaryAggregationService.fetchSessions           = async () => [];
        TemporalSummaryAggregationService.fetchMergedPrs          = async () => [];
        TemporalSummaryAggregationService.execCommand            = () => '2026-07-05T06:00:00Z\nlearn/agentos/decisions/0034-new-adr.md\nsrc/unrelated.mjs\nlearn/agentos/decisions/README.md\n';

        const sources = await TemporalSummaryAggregationService.fetchWindowSources({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        // only the NNNN-*.md ADR record matches — the unrelated file + the README are excluded
        expect(sources.adrsLanded).toEqual([{path: 'learn/agentos/decisions/0034-new-adr.md'}])
    })

    test('fetchDevCommits half-open: a commit whose %cI equals windowEnd is excluded (git --until is inclusive)', async () => {
        const commands = [];

        TemporalSummaryAggregationService.execCommand = command => {
            commands.push(command);
            return '2026-07-05T00:00:00Z\tsha-start\n2026-07-05T12:00:00Z\tsha-mid\n2026-07-06T00:00:00Z\tsha-end\n'
        };

        const commits = await TemporalSummaryAggregationService.fetchDevCommits({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        // windowStart is included; the boundary commit at windowEnd is dropped here so it is counted once — in the
        // NEXT contiguous window — rather than double-counted across both (git --since/--until are inclusive)
        expect(commits).toEqual([{sha: 'sha-start'}, {sha: 'sha-mid'}]);
        expect(commands[0]).toContain('--format=%cI%x09%H')
    })

    test('fetchAdrsLanded half-open: an ADR added in the boundary commit at windowEnd is excluded', async () => {
        // each commit emits its %cI date line, then --name-only lists its added files
        TemporalSummaryAggregationService.execCommand = () =>
            '2026-07-05T06:00:00Z\nlearn/agentos/decisions/0034-foo.md\n2026-07-06T00:00:00Z\nlearn/agentos/decisions/0035-bar.md\n';

        const adrs = await TemporalSummaryAggregationService.fetchAdrsLanded({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        // only the in-window commit's ADR survives; the boundary commit's add belongs to the next window
        expect(adrs).toEqual([{path: 'learn/agentos/decisions/0034-foo.md'}])
    })

    test('AC7 write-failure: a rejected Chroma upsert aborts before any SUMMARY_* graph label is minted', async () => {
        const nodes = [];

        StorageRouter.getTemporalSummaryCollection = async () => ({upsert: async () => { throw new Error('chroma upsert rejected') }});
        GraphService.upsertNode                    = node => { nodes.push(node) };

        await expect(TemporalSummaryAggregationService.persistTemporalRecord({
            id            : 'temporal-summary-daily-unified-2026-07-05-v1',
            metadata      : {level: 'daily', partition: 'unified', windowStart: '2026-07-05T00:00:00.000Z', windowEnd: '2026-07-06T00:00:00.000Z', version: 1},
            velocityFields: {mergedPrs: 3}
        })).rejects.toThrow('chroma upsert rejected');

        // the Chroma upsert is awaited BEFORE the durable graph write, so a vector-store failure leaves no orphan
        // SUMMARY_DAILY node pointing at a row that was never persisted
        expect(nodes).toHaveLength(0)
    })

    test('AC7 replay: persisting the same record twice re-upserts one deterministic id (idempotent, no duplicate)', async () => {
        const upserts = [], nodes = [];

        StorageRouter.getTemporalSummaryCollection = async () => ({upsert: async args => { upserts.push(args) }});
        GraphService.upsertNode                    = node => { nodes.push(node) };

        const record = {
            id            : 'temporal-summary-daily-unified-2026-07-05-v1',
            metadata      : {level: 'daily', partition: 'unified', windowStart: '2026-07-05T00:00:00.000Z', windowEnd: '2026-07-06T00:00:00.000Z', version: 1},
            velocityFields: {mergedPrs: 3}
        };

        await TemporalSummaryAggregationService.persistTemporalRecord(record);
        await TemporalSummaryAggregationService.persistTemporalRecord(record);

        // replay overwrites in place: both attempts key the SAME id on both stores, so re-running a window is
        // idempotent rather than accumulating a second row/node
        expect(upserts.map(entry => entry.ids[0])).toEqual([record.id, record.id]);
        expect(nodes.map(node => node.id)).toEqual([record.id, record.id])
    })
});
