import {test, expect}           from '@playwright/test';
import {createBoundedRetryGate} from '../../../../../../ai/services/shared/boundedRetryGate.mjs';

/**
 * @summary Spec floor for the bounded-retry gate — the concurrency falsifiers the design must
 * survive, encoded as executable tests.
 *
 * The decisive falsifiers map here and into the HealthService suite:
 * 1. A→B→A generation isolation            → 'A→B→A: an old generation's result never…' (this file)
 * 2. A→B→C latest-demand delivery          → 'A→B→C: the latest demand gets its own run…' (this file)
 * 3. different-key runNow() resumption     → 'runNow for a different key…' (this file)
 * 4. stop-while-active restart maxActive=1 → HealthService.spec.mjs producer suite (same-gate restart)
 * 5. cached-pending projection             → HealthService.spec.mjs overlay suite
 * 6. exact-head closure/docs truth         → PR evidence + configBase leaf JSDoc
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
 * @param {Function} [options.runImpl] Custom attempt body; default resolves healthy immediately.
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

        advance(500);                          // t=1000+: window for the second failure (2000ms) is open at t>=2000…
        const stillCached = await gate.tick({key: 'A'});
        expect(runs.length).toBe(2);          // second failure backs off 2000ms from t=1000 → t<3000 cached
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

        const tickA1 = gate.tick({key: 'A'}); // flight for generation A#1
        await flush();
        expect(runs).toEqual(['A']);

        const tickB  = gate.tick({key: 'B'}); // rotate to B, coalesced behind the A#1 flight
        const tickA2 = gate.tick({key: 'A'}); // rotate to A#2 — a NEW generation object; B's waiter folds in

        deferrals[0].resolve(healthy('OLD-A')); // the superseded A#1 flight settles

        const resultA1 = await tickA1;
        expect(resultA1.tag).toBe('OLD-A');       // old A's joiner receives old A's OWN result
        expect(resultA1.gate.key).toBe('A');
        expect(resultA1.gate.coalesced).toBe(false);

        await flush();
        expect(runs).toEqual(['A', 'A']);         // old A drained, then A#2's OWN run — B never runs
        expect(gate.snapshot().cached).toBe(null); // the drained result did NOT land in A#2

        deferrals[1].resolve(healthy('NEW-A'));

        const resultA2 = await tickA2;
        expect(resultA2.tag).toBe('NEW-A');       // A#2's waiter receives its own generation's run
        expect(resultA2.gate.coalesced).toBe(false);

        const resultB = await tickB;
        expect(resultB.tag).toBe('NEW-A');        // the folded waiter receives the serving run's truth…
        expect(resultB.gate.key).toBe('A');       // …annotated with the generation that ACTUALLY ran…
        expect(resultB.gate.coalesced).toBe(true);// …and marked as folded
        expect(resultB.gate.demandedKey).toBe('B');

        expect(gate.snapshot().cached.result.tag).toBe('NEW-A'); // only A#2's own result is cached
    });

    test('A→B→C: the latest demand gets its own run; folded waiters get truthful annotations', async () => {
        const {gate, runs, deferrals} = makeGate();

        const tickA = gate.tick({key: 'A'}); // flight A#1
        await flush();

        const tickB = gate.tick({key: 'B'}); // pending B
        const tickC = gate.tick({key: 'C'}); // pending re-points to C; B's waiter folds

        deferrals[0].resolve(healthy('OLD-A'));
        await tickA;
        await flush();

        expect(runs).toEqual(['A', 'C']); // C runs next — the coalesced LATEST demand, never B

        deferrals[1].resolve(healthy('C-OWN'));

        const resultC = await tickC;
        expect(resultC.tag).toBe('C-OWN');
        expect(resultC.gate.key).toBe('C');
        expect(resultC.gate.coalesced).toBe(false);

        const resultB = await tickB;
        expect(resultB.tag).toBe('C-OWN');          // truthful delivery: C's own result…
        expect(resultB.gate.key).toBe('C');         // …annotated as C (not old-A wearing C's key)…
        expect(resultB.gate.coalesced).toBe(true);  // …marked folded
        expect(resultB.gate.demandedKey).toBe('B');

        expect(gate.snapshot().cached.result.tag).toBe('C-OWN');
    });

    test('runNow for a different key during a flight runs that key next — the resumption falsifier', async () => {
        const {gate, runs, deferrals} = makeGate();

        const tickA = gate.tick({key: 'A'});
        await flush();

        const forced = gate.runNow({key: 'C'}); // operator demand for a different generation

        deferrals[0].resolve(healthy('OLD-A'));
        await tickA;
        await flush();

        expect(runs).toEqual(['A', 'C']);

        deferrals[1].resolve(healthy('C-OWN'));

        const resultC = await forced;
        expect(resultC.tag).toBe('C-OWN');      // the caller gets C's OWN run, not the superseded flight
        expect(resultC.gate.key).toBe('C');
        expect(resultC.gate.coalesced).toBe(false);
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
            gate.runNow({key: 'A'}), // pending → A#2 (forced)
            gate.runNow({key: 'B'})  // pending → B#2 (forced)
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
