import {setup} from '../../../../../../setup.mjs';

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
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';

import {partitionFleetStart, renderFleetStartSummary, summarizeFleetStart} from '../../../../../../../../apps/agentos/util/fleetStartPlan.mjs';

/**
 * @summary Tests for the fleet-start plan helpers — the pure half of the fleet-level
 * bring-up: wire-derived eligibility partition (excluded-with-reason, never silently
 * skipped) and the honest outcome summary (started / unknown / rejected / excluded).
 */

/** A usable three-source collection: the runtime axis is WIRED with real confidence. */
const wiredRuntime = (confidence = 'observed') => ({
    roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
    repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
    runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence}
});

test.describe('fleetStartPlan — the staged fleet bring-up (pure half)', () => {

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

    test('authority rule: every KNOWN non-active participationStatus is excluded — the wake/heartbeat hard-gate reading; null stays eligible (open set)', () => {
        const {eligible, excluded} = partitionFleetStart([
            // the live-registry shape: defined, launchable, wired, down — and benched
            {agentId: 'gemini', state: 'off', launchable: true, sources: wiredRuntime(), participationStatus: 'operator_benched'},
            // active passes; null (no identity root) passes — unknown/custom residents are the
            // open-set case, an absent root is not a recorded prohibition
            {agentId: 'vega',      state: 'off', sources: wiredRuntime(), participationStatus: 'active'},
            {agentId: 'guest-def', state: 'off', sources: wiredRuntime(), participationStatus: null},
            // temporarily_unreachable is a KNOWN non-active status — the wake-subscription
            // liveness gate and heartbeat target discovery both exclude it, and lifecycle
            // fan-out follows the same authority
            {agentId: 'ada', state: 'off', sources: wiredRuntime(), participationStatus: 'temporarily_unreachable'},
            // a NOVEL non-null status fails closed too: any recorded non-active value is an
            // exclusion until eligibility is deliberately widened
            {agentId: 'future', state: 'off', sources: wiredRuntime(), participationStatus: 'hibernating'}
        ]);

        expect(eligible.map(record => record.agentId)).toEqual(['vega', 'guest-def']);
        expect(excluded.map(entry => entry.agentId)).toEqual(['gemini', 'ada', 'future']);
        expect(excluded[0].reason).toContain('operator_benched');
        expect(excluded[1].reason).toContain('temporarily_unreachable');
        expect(excluded[2].reason).toContain('hibernating')
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

        // a missing-state fact OMITTING its confidence field is an incomplete answer under the
        // airtight vocabulary (missing/not-wired pair only with an explicit `none`) → it reads
        // `invalid` — and the start STILL fails closed, which is this rule's actual authority
        ({eligible, excluded} = partitionOne({
            agentId: 'gone', state: 'off',
            sources: {...wiredRuntime(), runtime: {source: 'fleet:runtimeStatus', state: 'missing'}}
        }));
        expect(eligible).toHaveLength(0);
        expect(excluded[0].reason).toContain("runtime source 'invalid'");

        // the complete declared shape keeps its own name in the exclusion
        ({eligible, excluded} = partitionOne({
            agentId: 'gone-2', state: 'off',
            sources: {...wiredRuntime(), runtime: {source: 'fleet:runtimeStatus', state: 'missing', confidence: 'none'}}
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

        // the preserve side: genuinely WIRED stopped records are the fleet start's exact target
        expect(partitionOne({agentId: 'observed-down', state: 'off', sources: wiredRuntime('observed')}).eligible).toHaveLength(1);
        expect(partitionOne({agentId: 'inferred-down', state: 'off', sources: wiredRuntime('inferred')}).eligible).toHaveLength(1)
    });

    test('unknown timeout state is not silently retried by a later fleet activation; explicit non-timeout failures remain eligible', () => {
        const {eligible, excluded} = partitionFleetStart([
            {
                agentId      : 'euclid',
                controlReason: {action: 'start', kind: 'timeout', reason: 'start timed out after 30000ms'},
                sources      : wiredRuntime(),
                state        : 'off'
            },
            {
                agentId      : 'ada',
                controlReason: {action: 'start', kind: 'rejected', reason: 'harness offline'},
                sources      : wiredRuntime(),
                state        : 'off'
            }
        ]);

        expect(eligible.map(record => record.agentId)).toEqual(['ada']);
        expect(excluded).toHaveLength(1);
        expect(excluded[0].agentId).toBe('euclid');
        expect(excluded[0].reason).toContain('outcome unknown');
        expect(excluded[0].reason).toContain('explicit card control')
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
        expect(summary.rejected).toEqual([{agentId: 'ada', reason: 'missing credential'}]);
        expect(summary.unknown).toEqual([
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
        expect(summary.unknown).toHaveLength(0);
        expect(summary.rejected[0].reason).toContain('unauthorized:')
    });

    test('renderFleetStartSummary: the at-a-glance counts line + every reason reachable in the detail', () => {
        const {text, detail} = renderFleetStartSummary({
            attempted: 3,
            excluded : [{agentId: null, reason: 'guest — no fleet definition to start'}],
            rejected : [{agentId: 'ada', reason: 'missing credential'}],
            started  : 2,
            total    : 5,
            unknown  : [{agentId: 'euclid', reason: 'timeout: start timed out after 30000ms'}]
        });

        expect(text).toBe('2 started · 1 UNKNOWN · 1 rejected · 1 excluded');
        expect(detail).toContain('euclid: timeout: start timed out after 30000ms');
        expect(detail).toContain('ada: missing credential');
        expect(detail).toContain('(guest): guest — no fleet definition to start');

        // the quiet batch: everything started, nothing to explain
        const clean = renderFleetStartSummary({attempted: 2, excluded: [], rejected: [], started: 2, total: 2, unknown: []});

        expect(clean.text).toBe('2 started');
        expect(clean.detail).toBe('')
    });
});
