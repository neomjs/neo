import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    decideHealAction,
    dispatchHeal,
    DEFAULT_DISPATCH_BOUNDS,
    HEAL_ACTIONS,
    MUTATING_HEAL_ACTIONS
} from '../../../../../../../ai/services/memory-core/helpers/healActionDispatch.mjs';

const NOW = 10_000_000;

test.describe('decideHealAction — autonomous bounded-dispatch safety gate', () => {
    test('action none / absent → no-op (nothing to heal)', () => {
        expect(decideHealAction({action: 'none', now: NOW})).toMatchObject({execute: false, status: 'no-op'});
        expect(decideHealAction({now: NOW})).toMatchObject({execute: false, status: 'no-op'});
    });

    test('an unknown action → unknown-action (fail-closed: never execute an unrecognized heal)', () => {
        expect(decideHealAction({action: 'rm-rf-everything', collection: 'mc', now: NOW}))
            .toMatchObject({execute: false, status: 'unknown-action'});
    });

    test('non-mutating containment (freeze / quarantine) always executes — no rate/thrash bound', () => {
        // even with a flood of recent runs, containment is always allowed (it mutates nothing)
        const recentRuns = Array.from({length: 99}, () => ({action: 'quarantine', collection: 'mc', at: NOW - 1}));
        expect(decideHealAction({action: 'freeze', collection: 'mc', recentRuns, now: NOW})).toMatchObject({execute: true, status: 'execute'});
        expect(decideHealAction({action: 'quarantine', collection: 'mc', recentRuns, now: NOW})).toMatchObject({execute: true, status: 'execute'});
    });

    test('a mutating action with no recent runs → execute (within bounds)', () => {
        expect(decideHealAction({action: 're-embed-missing', collection: 'mc-memory', recentRuns: [], now: NOW}))
            .toMatchObject({execute: true, status: 'execute'});
    });

    test('anti-thrash: a same action+collection run inside the cooldown → thrash-cooldown (no loop)', () => {
        const recentRuns = [{action: 're-embed-missing', collection: 'mc-memory', at: NOW - 60_000}]; // 1 min ago < 10 min cooldown
        expect(decideHealAction({action: 're-embed-missing', collection: 'mc-memory', recentRuns, now: NOW}))
            .toMatchObject({execute: false, status: 'thrash-cooldown'});
    });

    test('the cooldown is per action+collection — a different collection is unaffected', () => {
        const recentRuns = [{action: 're-embed-missing', collection: 'mc-memory', at: NOW - 60_000}];
        expect(decideHealAction({action: 're-embed-missing', collection: 'mc-graph', recentRuns, now: NOW}))
            .toMatchObject({execute: true, status: 'execute'});
    });

    test('rate-limit: too many runs of the same action+collection in the window → rate-limited', () => {
        // 3 runs spread across the hour but all older than the cooldown → cooldown passes, but the window rate trips.
        const recentRuns = [
            {action: 'defrag', collection: 'mc-memory', at: NOW - 3_000_000},
            {action: 'defrag', collection: 'mc-memory', at: NOW - 2_000_000},
            {action: 'defrag', collection: 'mc-memory', at: NOW - 1_000_000}
        ];
        expect(decideHealAction({action: 'defrag', collection: 'mc-memory', recentRuns, now: NOW}))
            .toMatchObject({execute: false, status: 'rate-limited'});
    });

    test('the vocabulary split is frozen + mutating ⊂ all actions', () => {
        expect(Object.isFrozen(HEAL_ACTIONS)).toBe(true);
        expect(Object.isFrozen(MUTATING_HEAL_ACTIONS)).toBe(true);
        expect(MUTATING_HEAL_ACTIONS.every(a => HEAL_ACTIONS.includes(a))).toBe(true);
        expect(HEAL_ACTIONS).toContain('quarantine'); // quarantine is a containment heal-action
        expect(DEFAULT_DISPATCH_BOUNDS.maxRunsPerWindow).toBeGreaterThan(0);
    });
});

test.describe('dispatchHeal — actuator core dispatch (safety gate + injected execution)', () => {
    const ok = async () => ({status: 'healed', detail: 're-embedded 5 rows'});

    test('a held action (thrash-cooldown) returns the hold outcome and NEVER calls the operation', async () => {
        let   called     = false;
        const recentRuns = [{action: 're-embed-missing', collection: 'mc', at: NOW - 1000}],
              outcome    = await dispatchHeal({
                  action        : 're-embed-missing',
                  collection    : 'mc',
                  recentRuns,
                  now           : NOW,
                  healOperations: {'re-embed-missing': async () => { called = true; return ok(); }}
              });

        expect(outcome).toMatchObject({status: 'thrash-cooldown', healedAt: NOW});
        expect(called).toBe(false);
    });

    test('an executable action with a wired operation → healed + records the run', async () => {
        const runs    = [],
              outcome = await dispatchHeal({
                  action        : 're-embed-missing',
                  collection    : 'mc-memory',
                  evidence      : {gap: 5},
                  now           : NOW,
                  healOperations: {'re-embed-missing': ok},
                  recordRun     : async run => { runs.push(run); }
              });

        expect(outcome).toMatchObject({action: 're-embed-missing', collection: 'mc-memory', status: 'healed', detail: 're-embedded 5 rows'});
        expect(runs).toEqual([{action: 're-embed-missing', collection: 'mc-memory', at: NOW}]);
    });

    test('an executable action with NO wired operation → deferred (the missing-logic gap, autonomous, no page)', async () => {
        const outcome = await dispatchHeal({action: 'restore-delta-merge', collection: 'mc', now: NOW, healOperations: {}});

        expect(outcome).toMatchObject({status: 'deferred', healedAt: NOW});
        expect(outcome.detail).toMatch(/no heal operation wired/);
    });

    test('a throwing operation → failed (recorded, never escalated)', async () => {
        const outcome = await dispatchHeal({
            action        : 'defrag',
            collection    : 'mc',
            now           : NOW,
            healOperations: {defrag: async () => { throw new Error('chroma unreachable'); }}
        });

        expect(outcome).toMatchObject({status: 'failed', detail: 'chroma unreachable'});
    });

    test('the operation status+detail is carried through (e.g. quarantine reports frozen)', async () => {
        const outcome = await dispatchHeal({
            action        : 'quarantine',
            collection    : 'mc',
            now           : NOW,
            healOperations: {quarantine: async () => ({status: 'frozen', detail: 'collection marked unhealthy'})}
        });

        expect(outcome).toMatchObject({status: 'frozen', detail: 'collection marked unhealthy'});
    });

    test('recordRun is NOT called when the gate holds', async () => {
        let   recorded   = false;
        const recentRuns = [{action: 'defrag', collection: 'mc', at: NOW - 1000}];
        await dispatchHeal({
            action        : 'defrag',
            collection    : 'mc',
            recentRuns,
            now           : NOW,
            healOperations: {defrag: ok},
            recordRun     : async () => { recorded = true; }
        });

        expect(recorded).toBe(false);
    });
});
