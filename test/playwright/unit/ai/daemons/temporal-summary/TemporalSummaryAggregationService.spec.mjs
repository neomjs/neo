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
    let TemporalSummaryAggregationService, logger, StorageRouter, originals = {};

    test.beforeAll(async () => {
        TemporalSummaryAggregationService = (await import('../../../../../../ai/daemons/temporal-summary/TemporalSummaryAggregationService.mjs')).default;
        logger                            = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;
        StorageRouter                     = (await import('../../../../../../ai/services.mjs')).Memory_StorageRouter;

        originals = {
            info                        : logger.info,
            debug                       : logger.debug,
            error                       : logger.error,
            getTemporalSummaryCollection: StorageRouter.getTemporalSummaryCollection,
            getSummaryCollection        : StorageRouter.getSummaryCollection
        };
        logger.info  = () => {};
        logger.debug = () => {};
        logger.error = () => {}
    });

    test.afterAll(() => {
        logger.info  = originals.info;
        logger.debug = originals.debug;
        logger.error = originals.error
    });

    test.afterEach(() => {
        StorageRouter.getTemporalSummaryCollection = originals.getTemporalSummaryCollection;
        StorageRouter.getSummaryCollection         = originals.getSummaryCollection;

        // Drop instance-method seam overrides so the real prototype methods resurface for the next test.
        for (const seam of ['collectPendingWindows', 'persistTemporalRecord', 'runCycle', 'resolveAggregationAnchor', 'dailyWindowCount', 'sessionWindowCount', 'fetchWindowSources', 'fetchDevCommits', 'fetchSandboxesGraduated', 'fetchAdrsLanded', 'fetchSessions', 'fetchMergedPrs', 'readContentRecords', 'execCommand']) {
            delete TemporalSummaryAggregationService[seam]
        }
    });

    test('persistTemporalRecord upserts the record into the temporal-summary collection by its doc id', async () => {
        const upserts = [];

        StorageRouter.getTemporalSummaryCollection = async () => ({upsert: async args => { upserts.push(args) }});

        const record = {
            id            : 'temporal-summary-daily-unified-2026-07-05-v1',
            metadata      : {level: 'daily', partition: 'unified', windowStart: '2026-07-05T00:00:00.000Z', windowEnd: '2026-07-06T00:00:00.000Z', version: 1},
            velocityFields: {mergedPrs: 3}
        };

        await TemporalSummaryAggregationService.persistTemporalRecord(record);

        expect(upserts).toHaveLength(1);
        expect(upserts[0].ids).toEqual([record.id]);
        expect(upserts[0].metadatas).toEqual([record.metadata]);
        expect(JSON.parse(upserts[0].documents[0])).toEqual({mergedPrs: 3})
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

    test('fetchSandboxesGraduated reads the complete synced corpus, never a truncated live query', async () => {
        let execCalls = 0;

        TemporalSummaryAggregationService.execCommand        = () => { execCalls++; return '' };
        TemporalSummaryAggregationService.readContentRecords = type => {
            expect(type).toBe('discussions');

            return [
                {frontmatter: {number: 10, title: 'graduated', closedAt: '2026-07-05T10:00:00Z'}, body: 'text [GRADUATED_TO_TICKET] more'},
                {frontmatter: {number: 11, title: 'resolved',  closedAt: '2026-07-05T11:00:00Z'}, body: 'text [RESOLVED_TO_AC] more'},
                {frontmatter: {number: 12, title: 'no marker', closedAt: '2026-07-05T12:00:00Z'}, body: 'ordinary discussion'},
                {frontmatter: {number: 13, title: 'still open', closedAt: null},                  body: '[GRADUATED_TO_TICKET]'},
                {frontmatter: {number: 14, title: 'out of window', closedAt: '2026-07-09T00:00:00Z'}, body: '[GRADUATED_TO_TICKET]'}
            ]
        };

        const graduated = await TemporalSummaryAggregationService.fetchSandboxesGraduated({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        // no `gh api graphql` page — the corpus is complete, so the count cannot be silently truncated
        expect(execCalls).toBe(0);
        expect(graduated.map(entry => entry.ref)).toEqual(['discussion #10', 'discussion #11'])
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

        TemporalSummaryAggregationService.execCommand            = command => { commands.push(command); return 'abc123\ndef456\n' };
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
        expect(commands[0]).toContain('--until="2026-07-06T00:00:00.000Z"')
    });

    test('fetchWindowSources threads the graduated Discussions through from the synced corpus', async () => {
        TemporalSummaryAggregationService.fetchDevCommits    = async () => [];
        TemporalSummaryAggregationService.fetchAdrsLanded    = async () => [];
        TemporalSummaryAggregationService.fetchSessions      = async () => [];
        TemporalSummaryAggregationService.fetchMergedPrs     = async () => [];
        TemporalSummaryAggregationService.readContentRecords = () => [
            {frontmatter: {number: 10, title: 'graduated in window', closedAt: '2026-07-05T06:00:00.000Z'}, body: 'done [GRADUATED_TO_TICKET]'},
            {frontmatter: {number: 11, title: 'closed but no marker', closedAt: '2026-07-05T07:00:00.000Z'}, body: 'just closed'},
            {frontmatter: {number: 12, title: 'graduated out of window', closedAt: '2026-07-01T00:00:00.000Z'}, body: '[RESOLVED_TO_AC]'}
        ];

        const sources = await TemporalSummaryAggregationService.fetchWindowSources({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        // only the in-window, marker-bearing Discussion survives
        expect(sources.sandboxesGraduated).toEqual([
            {ref: 'discussion #10', headline: 'graduated in window', at: '2026-07-05T06:00:00.000Z'}
        ])
    });

    test('fetchAdrsLanded binds to ADR records added under learn/agentos/decisions within the window', async () => {
        TemporalSummaryAggregationService.fetchDevCommits         = async () => [];
        TemporalSummaryAggregationService.fetchSandboxesGraduated = async () => [];
        TemporalSummaryAggregationService.fetchSessions           = async () => [];
        TemporalSummaryAggregationService.fetchMergedPrs          = async () => [];
        TemporalSummaryAggregationService.execCommand            = () => 'learn/agentos/decisions/0034-new-adr.md\nsrc/unrelated.mjs\nlearn/agentos/decisions/README.md\n';

        const sources = await TemporalSummaryAggregationService.fetchWindowSources({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        // only the NNNN-*.md ADR record matches — the unrelated file + the README are excluded
        expect(sources.adrsLanded).toEqual([{path: 'learn/agentos/decisions/0034-new-adr.md'}])
    })
});
