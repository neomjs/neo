import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ManagerGestureClaimArbiterTest'
    },
    mockLocalStorage: false,
    mockMain        : false
});

import {test, expect}              from '@playwright/test';
import {createGestureClaimArbiter} from '../../../../src/manager/GestureClaimArbiter.mjs';

/**
 * @summary The gesture/claim protocol contract (docking design record §2.8.1): one token
 * per gesture, hit-claims on stable identity, validity/expiry, and deterministic outcomes for all
 * three cases — tie (earliest valid acquisition, stable-id lexicographic final tiebreak), stale
 * (ignored), no-claim (fail closed: `resolve()` returns null).
 *
 * The clock is injected and advanced by hand, so every ordering assertion below is deterministic
 * by construction — no waits, no real time.
 */
test.describe('Neo.manager.GestureClaimArbiter — the §2.8.1 claim protocol', () => {
    let clock, arbiter;

    const now = () => clock;

    test.beforeEach(() => {
        clock   = 1_000;
        arbiter = createGestureClaimArbiter({claimTtlMs: 100, now})
    });

    test('one token per gesture — unique across arbiters, stamped on every claim record', () => {
        const sibling = createGestureClaimArbiter({now});

        expect(arbiter.token).toBeTruthy();
        expect(sibling.token).toBeTruthy();
        expect(arbiter.token).not.toBe(sibling.token);

        const record = arbiter.claim('workspace-a', {id: 'zone-a'});

        expect(record.token).toBe(arbiter.token)
    });

    test('a single valid claim wins', () => {
        const zone = {id: 'zone-a'};

        arbiter.claim('workspace-a', zone);

        expect(arbiter.resolve()).toEqual({stableId: 'workspace-a', zone})
    });

    test('no claim → null — fail closed is the resolver default, not a special case', () => {
        expect(arbiter.resolve()).toBeNull()
    });

    test('the earliest valid acquisition wins', () => {
        const
            elder   = {id: 'zone-elder'},
            younger = {id: 'zone-younger'};

        arbiter.claim('workspace-b', elder);

        clock += 10;
        arbiter.claim('workspace-a', younger);

        // 'workspace-a' would win the lexicographic tiebreak — proving the age axis dominates it.
        expect(arbiter.resolve()).toEqual({stableId: 'workspace-b', zone: elder})
    });

    test('a same-millisecond tie falls to stable-id lexicographic order — never claim insertion order', () => {
        const
            zoneC = {id: 'zone-c'},
            zoneA = {id: 'zone-a'};

        // inserted c-first so an insertion-order resolver would answer 'workspace-c'
        arbiter.claim('workspace-c', zoneC);
        arbiter.claim('workspace-a', zoneA);

        expect(arbiter.resolve()).toEqual({stableId: 'workspace-a', zone: zoneA})
    });

    test('refresh keeps acquisition seniority while extending expiry', () => {
        const
            elder   = {id: 'zone-elder'},
            younger = {id: 'zone-younger'};

        arbiter.claim('workspace-elder', elder);

        clock += 60;
        arbiter.claim('workspace-a-younger', younger);

        // refresh the elder INSIDE its window: seniority must survive, expiry must extend
        clock += 30;
        arbiter.claim('workspace-elder', elder);

        // 90ms past the elder's ORIGINAL claim — expired unless the refresh extended it
        clock += 60;

        const winner = arbiter.resolve();

        expect(winner.stableId).toBe('workspace-elder');

        // ...and the refreshed record still carries the ORIGINAL acquisition time
        const record = arbiter.claim('workspace-elder', elder);

        expect(record.acquiredAt).toBe(1_000)
    });

    test('reacquisition after expiry is a NEW claim — stale seniority cannot revive', () => {
        const
            zoneA = {id: 'zone-a'},
            zoneB = {id: 'zone-b'};

        // A claims at t=1000 (expires t=1100)...
        arbiter.claim('workspace-a', zoneA);

        // ...B claims at t=1120, while A sits expired-but-unpruned in the map...
        clock = 1_120;
        arbiter.claim('workspace-b', zoneB);

        // ...and A re-claims at t=1150. An expired record is ABSENT by contract, so this is a
        // reacquisition: a fresh acquisition time, not the revival of t=1000 seniority.
        clock = 1_150;
        const record = arbiter.claim('workspace-a', zoneA);

        expect(record.acquiredAt).toBe(1_150);

        // The competitive proof: B (t=1120) beats the reacquired A (t=1150). Under the revival
        // defect A would carry t=1000 and steal the gesture back through its own staleness.
        expect(arbiter.resolve()).toEqual({stableId: 'workspace-b', zone: zoneB})
    });

    test('the expiry boundary is exact: a refresh AT expiresAt keeps seniority; one tick past is reacquisition', () => {
        const zone = {id: 'zone-a'};

        arbiter.claim('workspace-a', zone);

        // exactly at the boundary (expiresAt === now): still live — seniority survives
        clock = 1_100;
        expect(arbiter.claim('workspace-a', zone).acquiredAt).toBe(1_000);

        // one tick past the refreshed expiry (1100 + 100): reacquisition
        clock = 1_201;
        expect(arbiter.claim('workspace-a', zone).acquiredAt).toBe(1_201)
    });

    test('an expired claim is ignored AND pruned — staleness is not an error, it is absence', () => {
        arbiter.claim('workspace-a', {id: 'zone-a'});

        clock += 101;

        expect(arbiter.resolve()).toBeNull();
        expect(arbiter.claimCount).toBe(0)
    });

    test('an expired senior falls to the surviving junior', () => {
        const junior = {id: 'zone-junior'};

        arbiter.claim('workspace-senior', {id: 'zone-senior'});

        clock += 60;
        arbiter.claim('workspace-junior', junior);

        // 110ms past the senior's only claim, 50ms past the junior's — exactly one survivor
        clock += 50;

        expect(arbiter.resolve()).toEqual({stableId: 'workspace-junior', zone: junior})
    });

    test('release drops a claim; releasing an unknown id is a no-op', () => {
        arbiter.claim('workspace-a', {id: 'zone-a'});

        arbiter.release('workspace-a');
        arbiter.release('workspace-never-claimed');

        expect(arbiter.resolve()).toBeNull();
        expect(arbiter.claimCount).toBe(0)
    });

    test('reset kills every claim — the token\'s claims die with its gesture', () => {
        arbiter.claim('workspace-a', {id: 'zone-a'});
        arbiter.claim('workspace-b', {id: 'zone-b'});

        arbiter.reset();

        expect(arbiter.claimCount).toBe(0);
        expect(arbiter.resolve()).toBeNull()
    });

    test('a refresh adopts the latest zone handle — same stable identity, re-embodied surface', () => {
        const
            first  = {id: 'zone-first'},
            second = {id: 'zone-second'};

        arbiter.claim('workspace-a', first);
        arbiter.claim('workspace-a', second);

        expect(arbiter.resolve().zone).toBe(second);
        expect(arbiter.claimCount).toBe(1)
    });

    test('three simultaneous claimants, exactly one winner — the arbiter tier of the overlap falsifier', () => {
        const zones = {
            'workspace-a': {id: 'zone-a'},
            'workspace-b': {id: 'zone-b'},
            'workspace-c': {id: 'zone-c'}
        };

        // all three claim in the same millisecond — worst case for determinism
        arbiter.claim('workspace-c', zones['workspace-c']);
        arbiter.claim('workspace-b', zones['workspace-b']);
        arbiter.claim('workspace-a', zones['workspace-a']);

        const winner = arbiter.resolve();

        expect(winner).toEqual({stableId: 'workspace-a', zone: zones['workspace-a']});

        // resolving again yields the SAME winner — resolution is a pure read, not a consumption
        expect(arbiter.resolve()).toEqual(winner)
    })
});
