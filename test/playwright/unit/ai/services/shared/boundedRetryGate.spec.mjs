import {test, expect}           from '@playwright/test';
import {createBoundedRetryGate} from '../../../../../../ai/services/shared/boundedRetryGate.mjs';

/**
 * @summary Spec floor for the bounded-retry gate — the concurrency falsifiers the design must
 * survive, encoded as executable tests.
 *
 * The decisive falsifiers map here and into the HealthService suite:
 * 1. A→B→A generation isolation            → 'A→B→A: …' (this file)
 * 2. A→B→C latest-demand delivery          → 'A→B→C: …' (this file)
 * 3. different-key runNow() resumption     → 'runNow for a different key…' (this file)
 * 4. stop-while-active restart maxActive=1 → HealthService.spec.mjs producer suite (same-gate restart)
 * 5. cached-pending projection             → HealthService.spec.mjs overlay suite
 * 6. exact-head closure/docs truth         → PR evidence + config leaf JSDoc
 *
 * Waiter-truth contract (the folded-waiter semantics every rotation test asserts): a waiter
 * always receives the LATEST generation's truth — including joiners already attached to an
 * in-flight run when a rotation arrives — annotated by generation identity (`gate.genId` of the
 * serving run vs `gate.demandedGenId` of the waiter's own demand; `gate.coalesced` marks the fold).
 */

/**
 * @summary Manually-resolved promise for deterministic concurrency control.
 * @returns {{promise: Promise, resolve: Function, reject: Function}}
 */
function deferred() {
    let resolve, reject;

    const promise = new Promise((res, rej) => {
        resolve = res;
        reject  = rej;
    });

    return {promise, resolve, reject};
}

/** Flushes the microtask queue so a synchronously-launched flight has invoked its run body. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const healthy = tag => ({status: 'healthy', tag});
const failed  = tag => ({status: 'failed', error: `boom-${tag}`});

/**
 * @summary Builds a gate with a controllable run body and a manual clock.
 * @param {Object}   [options]
 * @param {Function} [options.runImpl] Custom attempt body; default resolves via `deferrals` for manual control.
 * @param {Number}   [options.maxFailureStreak=Infinity]
 * @returns {{gate: Object, runs: String[], deferrals: Object[], errors: Error[], advance: Function, clock: Function}}
 */
function makeGate({runImpl = null, maxFailureStreak = Infinity} = {}) {
    let t = 0;

    const runs      = [],
          deferrals = [],
          errors    = [];

    const gate = createBoundedRetryGate({
        run: ({key}) => {
            runs.push(key);

            if (runImpl) {
                return runImpl({key, runs, deferrals, errors});
            }

            const d = deferred();

            deferrals.push(d);

            return d.promise;
        },
        failureTtlMs   : 1000,
        failureTtlMaxMs: 5000,
        maxFailureStreak,
        now            : () => t
    });

    return {gate, runs, deferrals, errors, advance: ms => { t += ms; }, clock: () => t};
}

test.describe('ai/services/shared/boundedRetryGate', () => {
    test('single-flight storm: 32 concurrent tick() callers join one run', async () => {
        const {gate, runs, deferrals} = makeGate();

        const results = Promise.all(Array.from({length: 32}, () => gate.tick({key: 'A'})));

        await flush();
        expect(runs.length).toBe(1);

        deferrals[0].resolve(healthy('one'));

        for (const r of await results) {
            expect(r.status).toBe('healthy');
            expect(r.gate.key).toBe('A');
            expect(r.gate.coalesced).toBe(false);
        }
    });

    test('cadence-accurate: a healthy cached result never suppresses a scheduled tick', async () => {
        const {gate, runs} = makeGate({runImpl: () => healthy('fresh')});

        await gate.tick({key: 'A'});
        await gate.tick({key: 'A'});

        expect(runs.length).toBe(2); // the caller's scheduler owns the period — no second TTL on top
        expect(gate.snapshot().cached.result.status).toBe('healthy');
    });

    test('failure backoff: ticks inside the window serve the cached failure; runNow bypasses it', async () => {
        const {gate, runs, advance} = makeGate({runImpl: () => failed('x')});

        await gate.tick({key: 'A'});
        expect(gate.snapshot().backoffMs).toBe(1000);
        expect(gate.snapshot().nextAttemptAt).toBe(1000);

        advance(500);

        const cached = await gate.tick({key: 'A'});
        expect(runs.length).toBe(1);          // no run inside the window
        expect(cached.gate.cached).toBe(true);
        expect(cached.status).toBe('failed');

        const forced = await gate.runNow({key: 'A'});
        expect(runs.length).toBe(2);          // operator demand ignores the window
        expect(forced.gate.cached).toBe(false);

        advance(500);                          // t=1000: the second failure's 2000ms window runs to t=3000…
        const stillCached = await gate.tick({key: 'A'});
        expect(runs.length).toBe(2);
        expect(stillCached.gate.cached).toBe(true);

        advance(2000);                         // t=3000
        await gate.tick({key: 'A'});
        expect(runs.length).toBe(3);
    });

    test('exponential backoff doubles per consecutive failure and caps at the ceiling', async () => {
        const {gate, advance} = makeGate({runImpl: () => failed('x')});

        await gate.tick({key: 'A'});
        expect(gate.snapshot().backoffMs).toBe(1000);

        advance(1000);
        await gate.tick({key: 'A'});
        expect(gate.snapshot().backoffMs).toBe(2000);

        advance(2000);
        await gate.tick({key: 'A'});
        expect(gate.snapshot().backoffMs).toBe(4000);

        advance(4000);
        await gate.tick({key: 'A'});
        expect(gate.snapshot().backoffMs).toBe(5000); // capped at failureTtlMaxMs
    });

    test('autonomous recovery: a successful attempt clears streak, backoff, and failure cache', async () => {
        let attempt = 0;

        const {gate, advance} = makeGate({
            runImpl: () => ++attempt <= 2 ? failed(`n${attempt}`) : healthy('recovered')
        });

        await gate.tick({key: 'A'});
        advance(1000);
        await gate.tick({key: 'A'});
        expect(gate.snapshot().status).toBe('failed');
        expect(gate.snapshot().failureStreak).toBe(2);

        advance(2000);
        const recovered = await gate.tick({key: 'A'});

        expect(recovered.status).toBe('healthy');
        expect(gate.snapshot().failureStreak).toBe(0);
        expect(gate.snapshot().backoffMs).toBe(0);
        expect(gate.snapshot().nextAttemptAt).toBe(null);
    });

    test('a thrown run converts to a cached failure — never a rejection, and the next window retries fresh', async () => {
        let attempt = 0;

        const {gate, advance} = makeGate({
            runImpl: () => {
                attempt++;

                if (attempt === 1) {
                    throw new Error('kaboom');
                }

                return healthy('after');
            }
        });

        const first = await gate.tick({key: 'A'}); // resolves — does NOT reject
        expect(first.status).toBe('failed');
        expect(first.error).toContain('kaboom');
        expect(gate.snapshot().status).toBe('failed');

        advance(1000);

        const second = await gate.tick({key: 'A'});
        expect(second.status).toBe('healthy'); // not pinned to the thrown attempt
    });

    test('A→B→A: an old generation\'s result never contaminates a later same-named generation', async () => {
        const {gate, runs, deferrals} = makeGate();

        const tickA1 = gate.tick({key: 'A'}); // flight for generation A#1, waiter genId 1
        await flush();
        expect(runs).toEqual(['A']);

        const tickB  = gate.tick({key: 'B'}); // rotate to B#2; A#1's joiner migrates to the latest demand
        const tickA2 = gate.tick({key: 'A'}); // rotate to A#3 — a NEW generation object; everyone folds in

        deferrals[0].resolve(healthy('OLD-A')); // the superseded A#1 flight settles with no attached waiters
        await flush();
        expect(runs).toEqual(['A', 'A']);        // old A drained, then A#3's OWN run — B never runs
        expect(gate.snapshot().cached).toBe(null); // the drained result did NOT land in A#3

        deferrals[1].resolve(healthy('NEW-A'));

        const resultA2 = await tickA2;
        expect(resultA2.tag).toBe('NEW-A');       // A#3's waiter receives its own generation's run
        expect(resultA2.gate.coalesced).toBe(false);

        const resultA1 = await tickA1;
        expect(resultA1.tag).toBe('NEW-A');        // A#1's folded waiter receives the LATEST generation's truth…
        expect(resultA1.gate.key).toBe('A');       // …annotated with the generation that ACTUALLY served…
        expect(resultA1.gate.coalesced).toBe(true);// …marked as folded by generation identity…
        expect(resultA1.gate.demandedGenId).toBe(1);
        expect(resultA1.gate.genId).toBe(3);

        const resultB = await tickB;
        expect(resultB.tag).toBe('NEW-A');
        expect(resultB.gate.coalesced).toBe(true);
        expect(resultB.gate.demandedKey).toBe('B');

        expect(gate.snapshot().cached.result.tag).toBe('NEW-A'); // only A#3's own result is cached
    });

    test('A→B→C: the latest demand gets its own run; every folded waiter gets truthful annotations', async () => {
        const {gate, runs, deferrals} = makeGate();

        const tickA = gate.tick({key: 'A'}); // flight A#1
        await flush();

        const tickB = gate.tick({key: 'B'}); // pending B; A#1's joiner migrates
        const tickC = gate.tick({key: 'C'}); // pending re-points to C; all waiters fold in

        deferrals[0].resolve(healthy('OLD-A'));
        await flush();

        expect(runs).toEqual(['A', 'C']); // C runs next — the coalesced LATEST demand, never B

        deferrals[1].resolve(healthy('C-OWN'));

        const resultC = await tickC;
        expect(resultC.tag).toBe('C-OWN');
        expect(resultC.gate.key).toBe('C');
        expect(resultC.gate.coalesced).toBe(false);

        const resultA = await tickA;
        expect(resultA.tag).toBe('C-OWN');          // A#1's joiner receives the LATEST generation's truth…
        expect(resultA.gate.key).toBe('C');         // …annotated as C (not old-A presented as current)…
        expect(resultA.gate.coalesced).toBe(true);  // …marked folded
        expect(resultA.gate.demandedGenId).toBe(1);

        const resultB = await tickB;
        expect(resultB.tag).toBe('C-OWN');
        expect(resultB.gate.coalesced).toBe(true);
        expect(resultB.gate.demandedKey).toBe('B');

        expect(gate.snapshot().cached.result.tag).toBe('C-OWN');
    });

    test('runNow for a different key during a flight runs that key next — the resumption falsifier', async () => {
        const {gate, runs, deferrals} = makeGate();

        const tickA = gate.tick({key: 'A'});
        await flush();

        const forced = gate.runNow({key: 'C'}); // operator demand for a different generation

        deferrals[0].resolve(healthy('OLD-A'));
        await flush();

        expect(runs).toEqual(['A', 'C']);

        deferrals[1].resolve(healthy('C-OWN'));

        const resultC = await forced;
        expect(resultC.tag).toBe('C-OWN');      // the caller gets C's OWN run, not the superseded flight
        expect(resultC.gate.key).toBe('C');
        expect(resultC.gate.coalesced).toBe(false);

        const resultA = await tickA;            // the A joiner folded into the latest demand
        expect(resultA.tag).toBe('C-OWN');
        expect(resultA.gate.coalesced).toBe(true);
    });

    test('a tick during a forced same-key recovery joins the flight — never the stale terminal cache', async () => {
        let attempt = 0;

        const {gate, runs, advance, deferrals} = makeGate({
            runImpl: ({deferrals}) => {
                attempt++;

                if (attempt <= 2) {
                    return failed(`n${attempt}`);
                }

                const d = deferred();

                deferrals.push(d);

                return d.promise;
            },
            maxFailureStreak: 2
        });

        await gate.tick({key: 'A'});
        advance(1000);
        await gate.tick({key: 'A'});
        expect(gate.snapshot().status).toBe('terminal');

        const recovery = gate.runNow({key: 'A'}); // the forced recovery flight
        await flush();
        expect(gate.snapshot().inFlight).toBe(true);

        const joined = gate.tick({key: 'A'}); // must JOIN the recovery flight, not serve the stale terminal cache

        deferrals[0].resolve(healthy('recovered'));

        const r = await joined;
        expect(r.status).toBe('healthy');       // the recovery's truth, not the cached terminal failure
        expect(r.gate.terminal).toBe(false);
        expect(r.gate.coalesced).toBe(false);
        expect((await recovery).status).toBe('healthy');
        expect(runs.length).toBe(3);
    });

    test('every non-healthy outcome follows one failure predicate — inward and outward metadata agree', async () => {
        const {gate, runs, advance} = makeGate({runImpl: () => ({status: 'degraded', error: 'weird-status'})});

        const first = await gate.tick({key: 'A'});
        expect(first.gate.backoffMs).toBe(1000);      // the outward annotation…
        expect(first.gate.nextAttemptAt).toBe(1000);

        const snap = gate.snapshot();
        expect(snap.status).toBe('degraded');          // …matches the inward projection exactly
        expect(snap.backoffMs).toBe(1000);
        expect(snap.nextAttemptAt).toBe(1000);
        expect(snap.failureStreak).toBe(1);

        advance(500);
        const cached = await gate.tick({key: 'A'});
        expect(runs.length).toBe(1);                   // backoff suppresses retries for ANY non-healthy outcome
        expect(cached.gate.cached).toBe(true);
        expect(cached.gate.backoffMs).toBe(1000);
    });

    test('one captured settle timestamp: the response checkedAt equals the cache record', async () => {
        const {gate, advance} = makeGate({runImpl: () => healthy('x')});

        advance(1000); // t=1000

        const r = await gate.tick({key: 'A'});
        expect(r.gate.checkedAt).toBe(1000);
        expect(gate.snapshot().cached.checkedAt).toBe(1000); // never a second, later stamp

        advance(1000);

        const cached = await gate.tick({key: 'A'}); // healthy tick runs again (cadence-accurate)…
        expect(cached.gate.checkedAt).toBe(2000);   // …and the new settle is the new single timestamp
        expect(gate.snapshot().cached.checkedAt).toBe(2000);
    });

    test('snapshot() hands out an isolated copy — mutating it cannot change live gate behavior', async () => {
        const {gate, runs} = makeGate({runImpl: () => healthy('x')});

        await gate.tick({key: 'A'});

        const snap = gate.snapshot();
        snap.cached.result.status = 'failed';
        snap.cached.checkedAt     = -1;

        const again = gate.snapshot();
        expect(again.status).toBe('healthy');
        expect(again.cached.result.status).toBe('healthy');
        expect(again.cached.checkedAt).not.toBe(-1);
        expect(runs.length).toBe(1);
    });

    test('nested aliases are isolated: mutating snapshot or delivered results cannot rewrite the cache', async () => {
        const {gate, runs, advance} = makeGate({
            runImpl: () => ({status: 'failed', error: 'boom', detail: {marker: 'pristine'}, tags: ['a']})
        });

        const delivered = await gate.tick({key: 'A'}); // settles failed → the cache now holds the failure
        const snap      = gate.snapshot();

        // Mutate NESTED state through both outward aliases.
        snap.cached.result.detail.marker = 'mutated';
        snap.cached.result.tags.push('b');
        delivered.detail.marker          = 'mutated-delivered';

        advance(500);

        const cached = await gate.tick({key: 'A'}); // backoff-served read from cache
        expect(runs.length).toBe(1);
        expect(cached.detail.marker).toBe('pristine');
        expect(cached.tags).toEqual(['a']);

        const snap2 = gate.snapshot();
        expect(snap2.cached.result.detail.marker).toBe('pristine');
        expect(snap2.cached.result.tags).toEqual(['a']);
    });

    test('joined waiters receive independent delivery copies — one waiter\'s mutation cannot reach another', async () => {
        const {gate} = makeGate({
            runImpl: () => ({status: 'healthy', detail: {marker: 'pristine'}, tags: ['a']})
        });

        // Both waiters join the SAME flight — the exact joined-waiter probe shape.
        const [a, b] = await Promise.all([gate.tick({key: 'A'}), gate.tick({key: 'A'})]);

        a.detail.marker = 'mutated-by-A';
        a.tags.push('b');

        expect(b.detail.marker).toBe('pristine');
        expect(b.tags).toEqual(['a']);

        // …and the gate cache stays pristine too.
        const snap = gate.snapshot();
        expect(snap.cached.result.detail.marker).toBe('pristine');
        expect(snap.cached.result.tags).toEqual(['a']);
    });

    test('global single-flight holds across rotations and runNow churn (maxActive === 1)', async () => {
        let activeRuns = 0, maxActive = 0;

        const deferrals = [];

        const gate = createBoundedRetryGate({
            run: () => {
                activeRuns++;
                maxActive = Math.max(maxActive, activeRuns);

                const d = deferred();

                deferrals.push(d);
                d.promise.finally(() => { activeRuns--; });

                return d.promise;
            },
            failureTtlMs   : 1000,
            failureTtlMaxMs: 5000
        });

        const promises = [
            gate.tick({key: 'A'}),   // flight A#1
            gate.tick({key: 'B'}),   // pending B
            gate.tick({key: 'C'}),   // pending → C
            gate.runNow({key: 'A'}), // pending → A#4 (forced)
            gate.runNow({key: 'B'})  // pending → B#5 (forced)
        ];

        await flush();
        deferrals[0].resolve(healthy('first'));
        await flush();               // exactly one chained flight: the final coalesced demand
        deferrals[1].resolve(healthy('last'));

        await Promise.all(promises);

        expect(deferrals.length).toBe(2); // one active + one coalesced latest — never a queue
        expect(maxActive).toBe(1);
    });

    test('attempt budget: exhaustion goes terminal with a retained stopReason, and ticks stop running', async () => {
        const {gate, runs, advance} = makeGate({runImpl: () => failed('x'), maxFailureStreak: 2});

        await gate.tick({key: 'A'});
        advance(1000);

        const terminal = await gate.tick({key: 'A'});
        expect(terminal.gate.terminal).toBe(true);
        expect(terminal.gate.stopReason).toContain('attempt budget exhausted');
        expect(terminal.gate.nextAttemptAt).toBe(null);
        expect(terminal.gate.resumeVia).toContain('runNow');

        const snapshot = gate.snapshot();
        expect(snapshot.status).toBe('terminal');

        advance(60000);
        const after = await gate.tick({key: 'A'}); // no run after terminal — the cached terminal result serves
        expect(runs.length).toBe(2);
        expect(after.gate.cached).toBe(true);
        expect(after.gate.terminal).toBe(true);
    });

    test('runNow resumes a terminal gate; a healthy settle un-exhausts it', async () => {
        let attempt = 0;

        const {gate, advance} = makeGate({
            runImpl         : () => ++attempt <= 2 ? failed('x') : healthy('resumed'),
            maxFailureStreak: 2
        });

        await gate.tick({key: 'A'});
        advance(1000);
        await gate.tick({key: 'A'});
        expect(gate.snapshot().status).toBe('terminal');

        const resumed = await gate.runNow({key: 'A'}); // the named resumption path
        expect(resumed.status).toBe('healthy');
        expect(gate.snapshot().terminal).toBe(false);
        expect(gate.snapshot().failureStreak).toBe(0);
        expect(gate.snapshot().status).toBe('healthy');
    });

    test('same-key runNow joins the in-flight run instead of overlapping it', async () => {
        const {gate, runs, deferrals} = makeGate();

        const scheduled = gate.tick({key: 'A'});
        await flush();

        const forced = gate.runNow({key: 'A'});
        await flush();

        expect(runs.length).toBe(1);

        deferrals[0].resolve(healthy('joined'));

        expect((await scheduled).tag).toBe('joined');
        expect((await forced).tag).toBe('joined');
    });

    test('snapshot() is a pure read: never runs, and reports pending/in-flight/cached truth', async () => {
        const {gate, runs, deferrals} = makeGate();

        expect(gate.snapshot().status).toBe('never-started');
        expect(gate.snapshot().inFlight).toBe(false);
        expect(runs.length).toBe(0);

        const tick = gate.tick({key: 'A'});
        await flush();

        const mid = gate.snapshot();
        expect(mid.status).toBe('pending');  // no settled result yet
        expect(mid.inFlight).toBe(true);
        expect(runs.length).toBe(1);         // reads performed zero inference

        deferrals[0].resolve(healthy('done'));
        await tick;

        const after = gate.snapshot();
        expect(after.status).toBe('healthy');
        expect(after.inFlight).toBe(false);
        expect(after.cached.result.tag).toBe('done');
        expect(runs.length).toBe(1);
    });
});
