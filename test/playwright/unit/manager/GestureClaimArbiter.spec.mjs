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
    });

    /**
     * The witness above hands all three claims the same millisecond because the clock is held by
     * hand. Production does not hold it: a real pass does per-zone geometry and hit-test work
     * between claims, so a millisecond boundary can land mid-pass. These witnesses drive that
     * boundary deliberately — a clock that ticks once, at a chosen point in the pass.
     */
    test.describe('one instant per claim pass — the boundary that made all three windows win', () => {
        /**
         * A clock that ticks once, immediately after its `tickAfter`-th read.
         * @param {Number} tickAfter 1 = the boundary lands after the first read; Infinity = never
         * @returns {Function}
         */
        function tickingClock(tickAfter) {
            let value = 1_000,
                reads = 0;

            return () => {
                const current = value;
                if (++reads === tickAfter) { value += 1 }
                return current
            }
        }

        // Registration order is reverse-lexicographic, exactly as the coordinator-tier falsifier
        // registers its three overlapping windows: an insertion-order resolver answers 'workspace-c'.
        const passOrder = ['workspace-c', 'workspace-b', 'workspace-a'];

        /**
         * @param {Number} tickAfter
         * @param {Boolean} sharePassInstant Whether the caller samples ONE instant for the pass.
         * @returns {String|null}
         */
        function runPass(tickAfter, sharePassInstant) {
            const
                subject     = createGestureClaimArbiter({now: tickingClock(tickAfter)}),
                passInstant = sharePassInstant ? subject.passInstant() : undefined;

            for (const stableId of passOrder) {
                subject.claim(stableId, {id: stableId}, passInstant)
            }

            return subject.resolve()?.stableId ?? null
        }

        test('the lexicographic winner survives a boundary anywhere in the pass', () => {
            // No boundary: the case the suite could already see.
            expect(runPass(Infinity, true)).toBe('workspace-a');

            // Boundary after the FIRST claim — the shape observed on CI, which answered 'workspace-c'.
            expect(runPass(1, true)).toBe('workspace-a');

            // Boundary after the SECOND — the shape observed locally, which answered 'workspace-b'.
            expect(runPass(2, true)).toBe('workspace-a')
        });

        test('the NEGATIVE witness: per-claim clock reads let the boundary pick the winner', () => {
            // Without a shared pass instant each claim reads the clock itself, so the boundary
            // manufactures a seniority ordering out of the caller's iteration order. This is the
            // defect the parameter exists to remove — pinned so a regression cannot pass silently.
            //
            // Asserted as the PROPERTY, not as a boundary→winner table. An earlier revision pinned
            // `runPass(2, false) === 'workspace-b'`, which encoded how many times `claim()` happens
            // to read the clock: adding the separate refresh read for the TTL fix moved the boundary
            // and reddened this arm without changing anything it exists to witness. The defect was
            // never "workspace-b at 2" — it is that the winner is a FUNCTION OF THE BOUNDARY at all.
            // Sweeping every boundary is also strictly stronger than the three hand-picked ones.
            const
                boundaries = [Infinity, 1, 2, 3, 4, 5, 6, 7, 8],
                unshared   = new Set(boundaries.map(tickAfter => runPass(tickAfter, false))),
                shared     = new Set(boundaries.map(tickAfter => runPass(tickAfter, true)));

            // The defect: which window wins depends on where the millisecond landed.
            expect(unshared.size).toBeGreaterThan(1);

            // The fix: one instant per pass collapses it to the lexicographic winner, everywhere.
            expect([...shared]).toEqual(['workspace-a'])
        });

        test('seniority ACROSS passes still dominates — the age axis is untouched', () => {
            const elderInstant = arbiter.passInstant();

            arbiter.claim('workspace-b', {id: 'zone-b'}, elderInstant);

            clock += 10;

            // A later pass re-claims the elder and adds the lexicographically smaller newcomer.
            const laterInstant = arbiter.passInstant();

            arbiter.claim('workspace-b', {id: 'zone-b'}, laterInstant);
            arbiter.claim('workspace-a', {id: 'zone-a'}, laterInstant);

            // The refresh keeps the elder's acquisition, so it outranks the newcomer it would
            // otherwise lose the lexicographic tiebreak to.
            expect(arbiter.resolve().stableId).toBe('workspace-b')
        });

        test('passInstant() reads the arbiter\'s own injected clock, not the wall clock', () => {
            expect(arbiter.passInstant()).toBe(1_000);

            clock += 7;

            expect(arbiter.passInstant()).toBe(1_007)
        })
    });

    // ── The pass instant is SENIORITY only; TTL is wall-clock ──────────────────────────────────
    //
    // Sharing one instant across a pass fixes the ordering, and it must not leak into liveness.
    // A pass is not guaranteed to be short: deriving `expiresAt` from the pass START makes a claim
    // refreshed late in a slow pass arrive already expired, inverting "a claim lives claimTtlMs
    // after its LAST REFRESH". These arms hold that line at the exact boundary.
    test.describe('a slow pass must not expire the claims it is still raising', () => {
        test('a claim raised MORE than a TTL after passInstant() is live for a full TTL from ITS refresh', () => {
            const passInstant = arbiter.passInstant();     // clock = 1_000

            // The pass is slow: 150ms > claimTtlMs (100) elapses before this claim is raised.
            clock = 1_150;

            const record = arbiter.claim('zone-a', {id: 'a'}, passInstant);

            // Seniority still comes from the pass, which is the whole point of sharing the instant.
            expect(record.acquiredAt).toBe(passInstant);

            // But it is ALIVE, and for a full TTL measured from the refresh — not born expired.
            expect(record.expiresAt).toBe(1_250);
            expect(arbiter.resolve()?.zone).toEqual({id: 'a'});

            // Still resolvable right up to its own boundary...
            clock = 1_250;
            expect(arbiter.resolve()?.zone).toEqual({id: 'a'});

            // ...and stale one tick past it.
            clock = 1_251;
            expect(arbiter.resolve()).toBe(null)
        });

        test('an existing record that expired mid-pass is STALE, not pinned alive by the pass instant', () => {
            // All three instants differ ON PURPOSE. The acquisition (900) must not coincide with the
            // pass instant (950): if it did, the surviving `existing.acquiredAt` and the freshly
            // supplied `timestamp` would be the same number, and the assertion below would read the
            // same on both sides of the boundary — passing whether liveness is judged against the
            // refresh or against the stale pass instant, and so witnessing neither.
            clock = 900;
            arbiter.claim('zone-a', {id: 'first'});        // acquired 900 → expires 1_000

            clock = 950;
            const passInstant = arbiter.passInstant();     // 950, still before the expiry

            // The pass drags past the existing record's expiry.
            clock = 1_100;

            const record = arbiter.claim('zone-a', {id: 'second'}, passInstant);

            // Liveness is judged at the REFRESH, so this is a reacquisition: seniority resets to the
            // instant supplied now, and the dead record's acquiredAt does not survive. Judging it
            // against the stale pass instant would have read `expiresAt 1_000 >= 950` = live and
            // revived a claim that had already lapsed — carrying 900 forward instead of 950.
            expect(record.acquiredAt).toBe(passInstant);   // 950 shipped, 900 if the boundary regresses
            expect(record.expiresAt).toBe(1_200);
            expect(arbiter.resolve()?.zone).toEqual({id: 'second'})
        })
    })
});
