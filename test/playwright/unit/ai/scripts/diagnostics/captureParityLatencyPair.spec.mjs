import {test, expect} from '@playwright/test';
import {
    SEAT_ADAPTER_PRODUCER,
    assembleLatencyPair,
    captureParityLatencyPair,
    checkCapturePrerequisites
} from '../../../../../../ai/scripts/diagnostics/captureParityLatencyPair.mjs';
import {
    MIN_SAMPLES,
    PARITY_CACHE_CONVENTION
} from '../../../../../../ai/scripts/diagnostics/parityLatencyPair.mjs';

// This module's whole job is to produce samples OR refuse — never to produce a plausible number when its
// prerequisites are absent. So the assertions are mostly about the refusal being unreachable-by-argument,
// with positive controls proving the orchestration works once the gate opens.
//
// The gate is currently CLOSED (the generated seat-adapter path does not exist), so the reachable-today
// behaviour is refusal. The post-gate path is exercised through `checkCapturePrerequisites` and through the
// probe-shape assertions, which do not depend on the constant.

const CONDITIONS = {
    cacheConvention: PARITY_CACHE_CONVENTION,
    imageDigest    : 'sha256:e3b0c44298fc1c149afbf4c8996fb924',
    configHead     : '067a01facf',
    hostLoad       : 'idle; load1=0.38'
};

// Both topologies, both dimensions, per service — the shape the comparator now binds on all four slots.
const perService = base => ({memoryCoreMs: base, knowledgeBaseMs: base + 5}),
      bootProbe  = () => Promise.resolve({stdio: perService(100), parity: perService(210)}),
      hotProbe   = () => Promise.resolve({stdio: perService(10),  parity: perService(12)});

test.describe('⭐ the capture is BLOCKED on the seat-adapter producer, not satisfiable by argument', () => {
    test('the producer does not exist yet, and that is held as a constant', () => {
        // A caller-supplied "the adapter exists" would be a claim, not a fact. Holding it here means the gate
        // cannot be opened by typing — the same reason `pilotPlaneTerminal` holds its capability constant.
        expect(SEAT_ADAPTER_PRODUCER).toBeNull();
    });

    test('⭐ NO argument combination produces a measurement, and the refusal is flagged `blocked`', async () => {
        const candidates = [
            {sampleCount: 3,  conditions: CONDITIONS, acceptableOverhead: 3, probeSeatReady: bootProbe, probeHotCall: hotProbe},
            {sampleCount: 50, conditions: CONDITIONS, acceptableOverhead: 1, probeSeatReady: bootProbe, probeHotCall: hotProbe},
            {sampleCount: 3,  conditions: CONDITIONS, acceptableOverhead: 1e9, probeSeatReady: bootProbe, probeHotCall: hotProbe},
            {}, null, undefined
        ];

        for (const spec of candidates) {
            const result = await captureParityLatencyPair(spec);

            expect(result.ok).toBe(false);
            expect(result.blocked).toBe(true);
            expect(result).not.toHaveProperty('verdict');
            expect(result).not.toHaveProperty('pair');
        }
    });

    test('the refusal names the producer and refuses the direct-probe substitute explicitly', async () => {
        // The message an operator reads if they run this before the producer lands. It must not send them hunting
        // for a bad argument, and it must not read as an invitation to probe directly instead.
        const {reason} = await captureParityLatencyPair({
            sampleCount   : 3, conditions: CONDITIONS, acceptableOverhead: 3,
            probeSeatReady: bootProbe, probeHotCall: hotProbe
        });

        expect(reason).toContain('generated seat-adapter path does not exist');
        expect(reason).toContain('will not substitute a direct SDK probe');
        expect(reason).toContain('different question');
    });

    test('the structural blocker is reported BEFORE any caller-input complaint', () => {
        // Ordering matters: a missing adapter plus a bad sampleCount must report the adapter, because that is
        // the fact that determines what the operator can do next.
        const reason = checkCapturePrerequisites({sampleCount: 1, conditions: null});

        expect(reason).toContain('seat-adapter path');
        expect(reason).not.toContain('sampleCount');
    });
});

// The gate closes off `captureParityLatencyPair`, so the post-gate clauses are exercised through the
// validator's injected `producer` seam. Two source-text assertions were written here first and deleted: a
// behavioural claim witnessed by `toString()` passes even when the logic is broken and fails on a rename,
// which is coverage in name only.
test.describe('checkCapturePrerequisites — the post-gate contract, genuinely exercised', () => {
    const PRODUCER = 'generated seat adapter (hypothetical)';

    test('with a producer present, the sample floor is enforced', () => {
        expect(checkCapturePrerequisites({producer: PRODUCER, sampleCount: MIN_SAMPLES - 1, conditions: CONDITIONS}))
            .toContain(`at least ${MIN_SAMPLES}`);
        expect(checkCapturePrerequisites({producer: PRODUCER, sampleCount: 2.5, conditions: CONDITIONS}))
            .toContain('must be an integer');

        // Positive control: the floor itself passes, so the refusals above are not a blanket failure.
        expect(checkCapturePrerequisites({producer: PRODUCER, sampleCount: MIN_SAMPLES, conditions: CONDITIONS}))
            .toBeNull();
    });

    test('⭐ every one of the four conditions is required, asserted field by field', () => {
        // Reconstructing conditions after a run is how a pair becomes unreproducible while looking complete.
        // Dropping each field individually proves no single omission hides behind the others.
        for (const key of ['cacheConvention', 'imageDigest', 'configHead', 'hostLoad']) {
            const {[key]: _dropped, ...partial} = CONDITIONS,
                  reason                        = checkCapturePrerequisites({producer: PRODUCER, sampleCount: MIN_SAMPLES, conditions: partial});

            expect(reason, `omitting ${key} must refuse`).toContain(`conditions.${key}`);
            expect(reason).toContain('not reproducible');
        }
    });

    test('⭐ the ruled cache regime is enforced, not merely recorded', () => {
        // A caller describing a disallowed regime accurately is not a caller measuring an allowed one.
        const reason = checkCapturePrerequisites({
            producer  : PRODUCER, sampleCount: MIN_SAMPLES,
            conditions: {...CONDITIONS, cacheConvention: 'cold-with-three-image-build'}
        });

        expect(reason).toContain('exactly PARITY_CACHE_CONVENTION');
        expect(reason).toContain('deployment receipt rather than a latency leg');
    });

    test('a blank or non-string producer still blocks, so the seam cannot be abused to open the gate', () => {
        for (const producer of ['', '   ', 42, null, undefined]) {
            expect(checkCapturePrerequisites({producer, sampleCount: MIN_SAMPLES, conditions: CONDITIONS}))
                .toContain('seat-adapter path');
        }
    });
});

test.describe('probe contract — the orchestration refuses partial readings', () => {
    test('the structural gate takes precedence over a mis-wired caller', async () => {
        // An operator running this before the producer lands must see the real cause, not "bad probe".
        const missing = await captureParityLatencyPair({
            sampleCount: MIN_SAMPLES, conditions: CONDITIONS, acceptableOverhead: 3
        });

        expect(missing.ok).toBe(false);
        expect(missing.blocked).toBe(true);
        expect(missing.reason).toContain('seat-adapter path');
    });
});

// ⭐ THE CONTROL THE GATE WAS HIDING. While `SEAT_ADAPTER_PRODUCER` is null, nothing reaches the capture
// assembly through `captureParityLatencyPair`, so a defect behind the gate is invisible to every test. That
// is not hypothetical: a rename of the sample arrays left the handoff referencing four retired variables,
// this suite stayed green because the gate short-circuited first, and @neo-gpt found the `ReferenceError`
// only by forcing the capability on in memory.
//
// The assembly is therefore reachable directly. The capability gate stays on the terminal, so nothing here
// bypasses a check that guards a measurement's honesty — it performs the capture it is handed, while whether
// a capture may be attempted at all remains the terminal's decision.
test.describe('⭐ assembleLatencyPair — the post-gate path, actually executed', () => {
    const perService = base => ({memoryCoreMs: base, knowledgeBaseMs: base + 5}),
          probes     = {
              probeSeatReady: () => Promise.resolve({stdio: perService(100), parity: perService(210)}),
              probeHotCall  : () => Promise.resolve({stdio: perService(10),  parity: perService(12)})
          };

    test('a full capture reaches a real verdict with BOTH hot-call legs', async () => {
        const result = await assembleLatencyPair({
            sampleCount: MIN_SAMPLES, conditions: CONDITIONS, acceptableOverhead: 3, ...probes
        });

        expect(result.ok).toBe(true);
        expect(result.verdict).toBe('within-budget');
        // Names both services, which is what proves the four-slot handoff is wired to the real arrays.
        expect(Object.keys(result.pair.hotCall)).toEqual(['memoryCore', 'knowledgeBase']);
        expect(result.pair.boot.parity.sampleCount).toBe(MIN_SAMPLES);
        expect(result.conditions).toBe(CONDITIONS);
    });

    test('a flattened probe reading is refused with its SLOT and sample index named', async () => {
        for (const [label, bad] of [
            ['boot.stdio',     {probeSeatReady: () => Promise.resolve({stdio: 100, parity: perService(210)})}],
            ['boot.parity',    {probeSeatReady: () => Promise.resolve({stdio: perService(100), parity: 210})}],
            ['hotCall.stdio',  {probeHotCall:   () => Promise.resolve({stdio: 10, parity: perService(12)})}],
            ['hotCall.parity', {probeHotCall:   () => Promise.resolve({stdio: perService(10), parity: 12})}]
        ]) {
            const result = await assembleLatencyPair({
                sampleCount: MIN_SAMPLES, conditions: CONDITIONS, acceptableOverhead: 3, ...probes, ...bad
            });

            expect(result.ok, `${label} must refuse`).toBe(false);
            expect(result.reason).toContain(label);
            expect(result.reason).toContain('sample 0');
        }
    });

    test('a per-service reading missing ONE service is an unmeasured service, not a zero', async () => {
        const result = await assembleLatencyPair({
            sampleCount : MIN_SAMPLES, conditions: CONDITIONS, acceptableOverhead: 3, ...probes,
            probeHotCall: () => Promise.resolve({stdio: {memoryCoreMs: 10}, parity: perService(12)})
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('unmeasured service');
    });

    test('the probes are still required, and that is a plain refusal', async () => {
        const result = await assembleLatencyPair({sampleCount: MIN_SAMPLES, conditions: CONDITIONS, acceptableOverhead: 3});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('must both be functions');
        expect(result).not.toHaveProperty('blocked');
    });
});
