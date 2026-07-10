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

        originals = {info: logger.info, debug: logger.debug, error: logger.error, getTemporalSummaryCollection: StorageRouter.getTemporalSummaryCollection};
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
        TemporalSummaryAggregationService.stop();
        TemporalSummaryAggregationService.isPolling      = false;
        TemporalSummaryAggregationService.pollIntervalMs = null;

        // Drop instance-method seam overrides so the real prototype methods resurface for the next test.
        for (const seam of ['scheduleNext', 'acquireLease', 'releaseLease', 'collectPendingWindows', 'persistTemporalRecord', 'runCycle', 'resolveAggregationAnchor', 'dailyWindowCount', 'fetchWindowSources', 'fetchDevCommits', 'fetchSandboxesGraduated', 'fetchAdrsLanded', 'execCommand']) {
            delete TemporalSummaryAggregationService[seam]
        }
    });

    test('start() is a no-op when enabled is false', () => {
        let scheduled = 0;

        TemporalSummaryAggregationService.scheduleNext = () => { scheduled++ };
        TemporalSummaryAggregationService.start({enabled: false, pollIntervalMs: 1000});

        expect(TemporalSummaryAggregationService.isPolling).toBe(false);
        expect(scheduled).toBe(0)
    });

    test('start() schedules when enabled + is idempotent', () => {
        let scheduled = 0;

        TemporalSummaryAggregationService.scheduleNext = () => { scheduled++ };

        TemporalSummaryAggregationService.start({enabled: true, pollIntervalMs: 1000});
        expect(TemporalSummaryAggregationService.isPolling).toBe(true);
        expect(scheduled).toBe(1);

        // second start() while polling is a no-op — no second schedule
        TemporalSummaryAggregationService.start({enabled: true, pollIntervalMs: 1000});
        expect(scheduled).toBe(1)
    });

    test('start() throws when enabled without a positive pollIntervalMs', () => {
        expect(() => TemporalSummaryAggregationService.start({enabled: true})).toThrow(/positive pollIntervalMs/)
    });

    test('pulse() defers the whole cycle when the heavy-maintenance lease is held', async () => {
        let cycles = 0, releases = 0;

        TemporalSummaryAggregationService.scheduleNext = () => {};
        TemporalSummaryAggregationService.acquireLease = () => ({acquired: false, lease: {owner: 'rem-daemon'}});
        TemporalSummaryAggregationService.runCycle     = async () => { cycles++ };
        TemporalSummaryAggregationService.releaseLease = () => { releases++ };

        await TemporalSummaryAggregationService.pulse();

        expect(cycles).toBe(0);   // deferred — no aggregation runs under a held lease
        expect(releases).toBe(0)  // never acquired → nothing to release
    });

    test('pulse() runs the cycle + releases the lease when acquired', async () => {
        const persisted     = [];
        let   releasedToken = null;

        TemporalSummaryAggregationService.scheduleNext          = () => {};
        TemporalSummaryAggregationService.acquireLease          = () => ({acquired: true, lease: {token: 'tok-1'}});
        TemporalSummaryAggregationService.releaseLease          = token => { releasedToken = token };
        TemporalSummaryAggregationService.collectPendingWindows = async () => [{
            level      : 'daily',
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z',
            sources    : {mergedPrs: [{n: 1}]}
        }];
        TemporalSummaryAggregationService.persistTemporalRecord = async record => { persisted.push(record) };

        await TemporalSummaryAggregationService.pulse();

        expect(releasedToken).toBe('tok-1');   // lease always released in finally
        expect(persisted).toHaveLength(1);
        expect(persisted[0].metadata.partition).toBe('unified');
        expect(persisted[0].velocityFields.mergedPrs).toBe(1)
    });

    test('pulse() still releases the lease when the cycle throws', async () => {
        let releasedToken = null;

        TemporalSummaryAggregationService.scheduleNext = () => {};
        TemporalSummaryAggregationService.acquireLease = () => ({acquired: true, lease: {token: 'tok-2'}});
        TemporalSummaryAggregationService.releaseLease = token => { releasedToken = token };
        TemporalSummaryAggregationService.runCycle     = async () => { throw new Error('boom') };

        await TemporalSummaryAggregationService.pulse();   // pulse swallows the cycle error

        expect(releasedToken).toBe('tok-2')   // finally released despite the throw
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

    test('runCycle persists the unified track plus one record per agent seen in the window', async () => {
        const persisted = [];

        TemporalSummaryAggregationService.collectPendingWindows = async () => [{
            level      : 'daily',
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z',
            sources    : {
                mergedPrs: [{n: 1}, {n: 2}],
                sessions : [
                    {agentIdentity: '@neo-opus-ada', impact: 95},
                    {agentIdentity: '@neo-gpt',      impact: 10}
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

    test('collectPendingWindows plans the trailing daily windows + attaches each window fetched sources', async () => {
        TemporalSummaryAggregationService.resolveAggregationAnchor = () => '2026-07-06T12:00:00.000Z';
        TemporalSummaryAggregationService.dailyWindowCount         = () => 2;
        TemporalSummaryAggregationService.fetchWindowSources       = async window => ({mergedPrs: [{w: window.windowStart}]});

        const windows = await TemporalSummaryAggregationService.collectPendingWindows();

        expect(windows).toHaveLength(2);
        expect(windows[0]).toMatchObject({level: 'daily', windowStart: '2026-07-06T00:00:00.000Z', windowEnd: '2026-07-07T00:00:00.000Z'});
        expect(windows[1].windowStart).toBe('2026-07-05T00:00:00.000Z');
        expect(windows[0].sources.mergedPrs[0].w).toBe('2026-07-06T00:00:00.000Z')
    });

    test('fetchWindowSources binds devCommits to the dev first-parent window log', async () => {
        const commands = [];

        TemporalSummaryAggregationService.execCommand            = command => { commands.push(command); return 'abc123\ndef456\n' };
        TemporalSummaryAggregationService.fetchSandboxesGraduated = async () => [];   // isolate the devCommits binding
        TemporalSummaryAggregationService.fetchAdrsLanded        = async () => [];

        const sources = await TemporalSummaryAggregationService.fetchWindowSources({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        expect(sources.devCommits).toEqual([{sha: 'abc123'}, {sha: 'def456'}]);
        expect(commands[0]).toContain('git log --first-parent origin/dev');
        expect(commands[0]).toContain('--since="2026-07-05T00:00:00.000Z"');
        expect(commands[0]).toContain('--until="2026-07-06T00:00:00.000Z"')
    });

    test('fetchSandboxesGraduated binds to in-window closed Discussions carrying a graduation marker', async () => {
        const graphqlResponse = JSON.stringify({data: {repository: {discussions: {nodes: [
            {number: 10, title: 'graduated in window',  closedAt: '2026-07-05T06:00:00.000Z', comments: {nodes: [{body: 'done [GRADUATED_TO_TICKET]'}]}},
            {number: 11, title: 'closed but no marker', closedAt: '2026-07-05T07:00:00.000Z', comments: {nodes: [{body: 'just closed'}]}},
            {number: 12, title: 'graduated out of window', closedAt: '2026-07-01T00:00:00.000Z', comments: {nodes: [{body: '[RESOLVED_TO_AC]'}]}}
        ]}}}});

        TemporalSummaryAggregationService.fetchDevCommits = async () => [];
        TemporalSummaryAggregationService.fetchAdrsLanded = async () => [];
        TemporalSummaryAggregationService.execCommand     = () => graphqlResponse;

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
        TemporalSummaryAggregationService.execCommand            = () => 'learn/agentos/decisions/0034-new-adr.md\nsrc/unrelated.mjs\nlearn/agentos/decisions/README.md\n';

        const sources = await TemporalSummaryAggregationService.fetchWindowSources({
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z'
        });

        // only the NNNN-*.md ADR record matches — the unrelated file + the README are excluded
        expect(sources.adrsLanded).toEqual([{path: 'learn/agentos/decisions/0034-new-adr.md'}])
    })
});
