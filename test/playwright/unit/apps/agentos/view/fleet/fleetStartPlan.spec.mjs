import {setup} from '../../../../../setup.mjs';

const appName = 'FleetStartPlanTest';

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

import {partitionFleetStart, renderFleetStartSummary, summarizeFleetStart} from '../../../../../../../apps/agentos/view/fleet/fleetStartPlan.mjs';

/**
 * @summary Tests for the morning-start plan helpers — the pure half of the fleet-level
 * bring-up: wire-derived eligibility partition (excluded-with-reason, never silently
 * skipped) and the honest outcome summary (started / rejected-with-reasons / excluded).
 */

/** A usable three-source collection: the runtime axis is WIRED with real confidence. */
const wiredRuntime = (confidence = 'observed') => ({
    roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
    repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
    runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence}
});

test.describe('fleetStartPlan — the staged morning bring-up (pure half)', () => {

    test('partition: every exclusion is wire-derived and carries its reason; the down fleet is what starts', () => {
        const records = [
            {agentId: 'vega',   state: 'off',  sources: wiredRuntime()},                // eligible — wired down
            {agentId: 'ada',    state: 'ok',   sources: wiredRuntime()},                // up
            {agentId: 'grace',  state: 'idle', sources: wiredRuntime()},                // up (idle is alive)
            {agentId: 'native', state: 'off', launchable: false, family: 'native-neo'}, // no template
            {agentId: 'euclid', state: 'off', pendingAction: 'restart'},                // verb in flight
            {state: 'off'}                                                              // guest — no definition
        ];

        const {eligible, excluded} = partitionFleetStart(records);

        expect(eligible.map(record => record.agentId)).toEqual(['vega']);
        expect(excluded.map(({agentId, reason}) => ({agentId, hasReason: reason.length > 0}))).toEqual([
            {agentId: 'ada',    hasReason: true},
            {agentId: 'grace',  hasReason: true},
            {agentId: 'native', hasReason: true},
            {agentId: 'euclid', hasReason: true},
            {agentId: null,     hasReason: true}
        ]);
        expect(excluded.find(entry => entry.agentId === 'native').reason).toContain('native-neo');
        expect(excluded.find(entry => entry.agentId === 'euclid').reason).toContain('restart');
        expect(excluded.find(entry => entry.agentId === null).reason).toContain('guest')
    });

    test('tri-state honesty: launchable null (not read back) stays ELIGIBLE — the bridge owns the real refusal', () => {
        const {eligible, excluded} = partitionFleetStart([
            {agentId: 'vega', state: 'off', launchable: null, sources: wiredRuntime()},
            {agentId: 'ada',  state: 'off', sources: wiredRuntime()}   // launchable absent entirely
        ]);

        expect(eligible).toHaveLength(2);
        expect(excluded).toHaveLength(0)
    });

    test("authority rule: an 'operator_benched' identity NEVER starts — the recorded operator decision beats every runtime fact", () => {
        const {eligible, excluded} = partitionFleetStart([
            // the live-registry shape: defined, launchable, wired, down — and benched
            {agentId: 'gemini', state: 'off', launchable: true, sources: wiredRuntime(), participationStatus: 'operator_benched'},
            // active + null (no identity root) + temporarily_unreachable all pass this rule:
            // unreachable is an A2A-liveness fact, not a start prohibition
            {agentId: 'vega',  state: 'off', sources: wiredRuntime(), participationStatus: 'active'},
            {agentId: 'guest-def', state: 'off', sources: wiredRuntime(), participationStatus: null},
            {agentId: 'ada',   state: 'off', sources: wiredRuntime(), participationStatus: 'temporarily_unreachable'}
        ]);

        expect(eligible.map(record => record.agentId)).toEqual(['vega', 'guest-def', 'ada']);
        expect(excluded).toHaveLength(1);
        expect(excluded[0].agentId).toBe('gemini');
        expect(excluded[0].reason).toContain('operator_benched')
    });

    test("authority rule: unusable runtime provenance fails a start closed — projected 'off' is display fallback, not a stopped runtime", () => {
        const partitionOne = record => partitionFleetStart([record]);

        // the direct probe shape: not-wired/none must never be eligible
        let {eligible, excluded} = partitionOne({
            agentId: 'ghost', state: 'off',
            sources: {...wiredRuntime(), runtime: {source: 'fleet:runtimeStatus', state: 'not-wired', confidence: 'none'}}
        });
        expect(eligible).toHaveLength(0);
        expect(excluded[0].reason).toContain("runtime source 'not-wired'");

        // missing runtime axis → fail closed with the missing state visible
        ({eligible, excluded} = partitionOne({
            agentId: 'gone', state: 'off',
            sources: {...wiredRuntime(), runtime: {source: 'fleet:runtimeStatus', state: 'missing'}}
        }));
        expect(eligible).toHaveLength(0);
        expect(excluded[0].reason).toContain("runtime source 'missing'");

        // no sources at all → the normalizer fails the whole collection closed
        ({eligible, excluded} = partitionOne({agentId: 'bare', state: 'off'}));
        expect(eligible).toHaveLength(0);
        expect(excluded[0].reason).toContain('no usable lifecycle evidence');

        // a malformed fact (wrong producer literal) normalizes closed — cross-axis facts are not evidence
        ({eligible, excluded} = partitionOne({
            agentId: 'crossed', state: 'off',
            sources: {...wiredRuntime(), runtime: {source: 'fleet:fleetStatus', state: 'wired', confidence: 'observed'}}
        }));
        expect(eligible).toHaveLength(0);

        // the preserve side: genuinely WIRED stopped records are the morning start's exact target
        expect(partitionOne({agentId: 'observed-down', state: 'off', sources: wiredRuntime('observed')}).eligible).toHaveLength(1);
        expect(partitionOne({agentId: 'inferred-down', state: 'off', sources: wiredRuntime('inferred')}).eligible).toHaveLength(1)
    });

    test('mixed settle/reject: the summary counts honestly and keeps every terminal kind visible', () => {
        const partition = partitionFleetStart([
            {agentId: 'vega',   state: 'off', sources: wiredRuntime()},
            {agentId: 'ada',    state: 'off', sources: wiredRuntime()},
            {agentId: 'euclid', state: 'off', sources: wiredRuntime()},
            {agentId: 'up',     state: 'ok',  sources: wiredRuntime()}
        ]);

        // index-aligned per-eligible results in the C2 adapter's vocabulary
        const summary = summarizeFleetStart(partition, [
            {ok: true,  status: 'settled'},
            {ok: false, status: 'rejected', controlReason: {reason: 'missing credential'}},
            {ok: false, status: 'timeout',  controlReason: {reason: 'start timed out after 30000ms'}}
        ]);

        expect(summary.started).toBe(1);
        expect(summary.attempted).toBe(3);
        expect(summary.total).toBe(4);
        expect(summary.rejected).toEqual([
            {agentId: 'ada',    reason: 'missing credential'},
            // a timeout is an UNKNOWN outcome — the kind stays visible, never folded into a plain reject
            {agentId: 'euclid', reason: 'timeout: start timed out after 30000ms'}
        ]);
        expect(summary.excluded).toEqual([{agentId: 'up', reason: "already up — session state 'ok'"}])
    });

    test('all-reject: zero started renders honestly — partial success is the normal case, total failure is too', () => {
        const partition = partitionFleetStart([
            {agentId: 'vega', state: 'off', sources: wiredRuntime()},
            {agentId: 'ada',  state: 'off', sources: wiredRuntime()}
        ]);

        const summary = summarizeFleetStart(partition, [
            {ok: false, status: 'unauthorized', controlReason: {reason: 'Fleet Registry bridge unavailable'}},
            {ok: false, status: 'unauthorized', controlReason: {reason: 'Fleet Registry bridge unavailable'}}
        ]);

        expect(summary.started).toBe(0);
        expect(summary.rejected).toHaveLength(2);
        expect(summary.rejected[0].reason).toContain('unauthorized:')
    });

    test('renderFleetStartSummary: the at-a-glance counts line + every reason reachable in the detail', () => {
        const {text, detail} = renderFleetStartSummary({
            attempted: 3,
            excluded : [{agentId: null, reason: 'guest — no fleet definition to start'}],
            rejected : [{agentId: 'ada', reason: 'missing credential'}],
            started  : 2,
            total    : 4
        });

        expect(text).toBe('2 started · 1 rejected · 1 excluded');
        expect(detail).toContain('ada: missing credential');
        expect(detail).toContain('(guest): guest — no fleet definition to start');

        // the quiet morning: everything started, nothing to explain
        const clean = renderFleetStartSummary({attempted: 2, excluded: [], rejected: [], started: 2, total: 2});

        expect(clean.text).toBe('2 started');
        expect(clean.detail).toBe('')
    });
});
