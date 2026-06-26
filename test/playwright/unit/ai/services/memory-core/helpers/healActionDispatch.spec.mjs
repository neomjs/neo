import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    decideHealAction,
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
