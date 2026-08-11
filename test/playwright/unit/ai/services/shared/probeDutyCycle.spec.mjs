import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'ProbeDutyCycleTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../../../src/Neo.mjs';
import * as core              from '../../../../../../src/core/_export.mjs';
import {createProbeDutyCycle} from '../../../../../../ai/services/shared/probeDutyCycle.mjs';

/**
 * @summary The bound that keeps a periodic probe from becoming its provider's steady-state load.
 *
 * Measured on a live deployment: cadence 60s against a 264s attempt, ~88% provider occupancy, healthy
 * throughout. Single-flighting and failure backoff both leave the succeeding-slowly case unbounded —
 * a healthy result carries no suppression, correctly — so nothing stopped the probe re-issuing.
 *
 * The composition arm is the one to read first: this bounds ONE producer, and a deployment running
 * two puts up to twice the duty on a shared provider. That limit is asserted here rather than
 * described, because the previous framing of this fix called a per-producer bound a provider
 * guarantee, and it never was one.
 */
test.describe('probeDutyCycle — one producer', () => {
    /**
     * @summary Builds a floor over a controllable clock, with a `run` that advances it.
     * @param {Object} options
     * @returns {Object}
     */
    // `budget` defaults to the raised value the affected deployment actually runs, so the slow arms
    // below model an attempt that COMPLETES rather than one we abandoned — those are charged
    // differently on purpose, and the abandonment arm sets its own budget to exercise that.
    const harness = ({duty = 0.2, budget = 900000, cadence = 60000, now = 1_000_000} = {}) => {
        const state = {now, calls: 0};
        const floor = createProbeDutyCycle({
            clock       : () => state.now,
            maxDutyCycle: () => duty,
            timeoutMs   : () => budget,
            cadenceMs   : () => cadence
        });

        state.floor = floor;
        state.attempt = async runMs => floor.run(async () => {
            state.calls++;
            state.now += runMs;
            return {status: 'healthy'}
        });
        // One cadence tick: runs only when the provider is no longer owed idle.
        state.tick = async runMs => {
            state.now += cadence;

            if (!floor.eligible()) {
                floor.noteSkipped();
                return false;
            }

            await state.attempt(runMs);
            return true;
        };

        return state;
    };

    test('a probe slower than its cadence stops running back-to-back, and resumes when the floor is paid', async () => {
        const h = harness();

        await h.attempt(264000); // the span measured on the frozen deployment
        expect(h.calls).toBe(1);

        // 264s charged at d=0.2 buys 1056s of idle. 17 cadence ticks is 1020s — all inside it.
        for (let i = 0; i < 17; i++) {
            expect(await h.tick(264000), `tick ${i} must be suppressed`).toBe(false);
        }

        expect(h.calls).toBe(1);
        expect(h.floor.describe().skippedTicks).toBe(17);

        // NOT permanent. A guard that silently removed liveness detection would be a worse defect
        // than the pileup it replaces.
        expect(await h.tick(264000)).toBe(true);
        expect(h.calls).toBe(2)
    });

    test('NON-VACUITY — a fast probe is untouched: every cadence tick runs, no warning', async () => {
        const h = harness();

        await h.attempt(2000); // a warm embedder, far under the 8s floor it buys

        for (let i = 0; i < 5; i++) {
            expect(await h.tick(2000)).toBe(true);
        }

        expect(h.calls).toBe(6);
        // Scoped to the COST warning. The budget-vs-cadence warning is a separate finding about
        // configuration and fires regardless of how fast this probe runs — asserting an empty array
        // would conflate the two and make this control answer a question it was not asked.
        expect(h.floor.describe().warnings.some(w => w.includes('attempt cost'))).toBe(false)
    });

    /**
     * The charge model. A consumer timeout aborts the client, not the provider, so the instant we
     * give up measures our patience rather than the provider's occupancy.
     */
    test('an ABANDONED attempt is charged a further budget; one that returned inside it is not', async () => {
        const abandoned = harness({budget: 30000});

        await abandoned.attempt(30000); // consumed the whole budget

        expect(abandoned.floor.describe().chargedMs, '30s measured + 30s surcharge').toBe(60000);
        expect(abandoned.floor.describe().idleFloorMs, '60s * (1 - 0.2) / 0.2').toBe(240000);

        // A failure that cost the provider nothing must stay cheap to retry — charging it the full
        // budget would slow recovery on exactly the plane we most want to re-probe.
        const fast = harness({budget: 30000});

        await fast.attempt(5);

        expect(fast.floor.describe().chargedMs).toBe(5);
        expect(fast.floor.describe().idleFloorMs).toBe(20)
    });

    test('a replaced clock RE-BASES the remaining idle rather than dropping it', async () => {
        const h = harness();

        await h.attempt(264000); // owes 1056s from now
        expect(h.floor.eligible()).toBe(false);

        // A re-arm carrying a fresh time source must not be a way to bypass the floor.
        h.floor.rebaseClock(h.now, 5_000_000);
        h.now = 5_000_000;

        expect(h.floor.eligible(), 'the debt survives the clock swap').toBe(false);

        h.now = 5_000_000 + 1_056_000;

        expect(h.floor.eligible(), 'and it is finite — it clears at the same remaining offset').toBe(true)
    });

    test('a duty outside (0, 1) disables the floor and SAYS so', async () => {
        for (const duty of [0, 1, -0.5, 2]) {
            const h = harness({duty});

            await h.attempt(264000);

            expect(h.floor.eligible(), `duty ${duty} must not suppress`).toBe(true);
            expect(h.floor.describe().warnings.some(w => w.includes('duty-cycle floor disabled'))).toBe(true);
        }
    });

    test('the cost projection warns at the exact cadence boundary, not only past it', async () => {
        const h = harness({cadence: 60000, budget: 900000});

        await h.attempt(60000); // charged EXACTLY the cadence

        // `>=`: at cost == cadence the next tick lands on the settle instant — 100% occupancy, the
        // worst case, not an exempt one.
        expect(h.floor.describe().warnings.some(w => w.includes('exceeds the 60000ms cadence'))).toBe(true);
        // A budget larger than the period means an abandoned attempt outlives its own period.
        expect(h.floor.describe().warnings.some(w => w.includes('attempt budget 900000ms'))).toBe(true)
    });

    test('every seam is required — a floor built on values instead of getters is silently stale', () => {
        // Numerics MUST be getters: cadence, timeout and duty all re-resolve on a producer re-arm, and
        // a floor bound to construction-time values would keep enforcing a retired configuration.
        expect(() => createProbeDutyCycle({clock: () => 0, maxDutyCycle: 0.2, timeoutMs: () => 1, cadenceMs: () => 1}))
            .toThrow(/maxDutyCycle.*getter/);
        expect(() => createProbeDutyCycle()).toThrow(/getter/)
    })
});

test.describe('probeDutyCycle — TWO producers on one shared provider', () => {
    /**
     * @summary THE limitation, asserted rather than described.
     *
     * Memory Core runs a write canary and the Knowledge Base runs an embedding probe, in separate
     * processes, against the same embedder. Each instance is process-local state and bounds only
     * itself, so their occupancy ADDS. A reader who takes `maxDutyCycle` for a provider guarantee is
     * wrong by exactly the number of producers running — and that is the mistake the first version of
     * this fix made in its own documentation.
     *
     * A provider-wide bound would need coordination these processes do not have; what is available is
     * an honest per-producer bound plus leaves sized for how many run.
     */
    test('their duties ADD — the bound is per-producer, never a provider guarantee', async () => {
        const clock = {now: 0};
        const make  = duty => createProbeDutyCycle({
            clock       : () => clock.now,
            maxDutyCycle: () => duty,
            timeoutMs   : () => 900000,
            cadenceMs   : () => 60000
        });

        // The shipped defaults: Memory Core 0.2, Knowledge Base 0.1 (halved because the KB also drives
        // tenant ingestion through the same provider).
        const memoryCore    = make(0.2),
              knowledgeBase = make(0.1);

        const runOn = async (floor, runMs) => floor.run(async () => { clock.now += runMs; });

        await runOn(memoryCore, 100000);
        clock.now = 0;
        await runOn(knowledgeBase, 100000);

        const mc = memoryCore.describe(),
              kb = knowledgeBase.describe();

        // Each holds its own share of wall-clock: 100s of work per 500s and per 1000s respectively.
        expect(mc.chargedMs / mc.effectivePeriodMs).toBeCloseTo(0.2, 5);
        expect(kb.chargedMs / kb.effectivePeriodMs).toBeCloseTo(0.1, 5);

        // Together, on ONE provider, they are 30% — not 20%, and not either leaf's value. Anyone
        // sizing these leaves has to add them up.
        const combined = mc.chargedMs / mc.effectivePeriodMs + kb.chargedMs / kb.effectivePeriodMs;

        expect(combined).toBeCloseTo(0.3, 5);
        expect(combined, 'two producers cannot be read off one leaf').not.toBeCloseTo(0.2, 5)
    });

    test('one producer being suppressed does not suppress the other — they are independent state', async () => {
        const clock = {now: 1_000_000};
        const make  = () => createProbeDutyCycle({
            clock       : () => clock.now,
            maxDutyCycle: () => 0.2,
            timeoutMs   : () => 900000,
            cadenceMs   : () => 60000
        });

        const a = make(),
              b = make();

        await a.run(async () => { clock.now += 264000; });

        expect(a.eligible(), 'a owes idle').toBe(false);
        expect(b.eligible(), 'b has run nothing and is free — no cross-process coordination exists').toBe(true)
    })
});
