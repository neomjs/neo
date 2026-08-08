import {test, expect} from '@playwright/test';
import {
    RECOVERY_KNOBS,
    isKnownKnob,
    knobLeafPaths,
    knobRequiredContext,
    validateKnobTransaction
} from '../../../../../../../ai/services/memory-core/helpers/recoveryKnobRegistry.mjs';

const
    KB_KNOB = 'kb-server-heap-ceiling',
    MC_KNOB = 'mc-server-heap-ceiling',
    KB_LEAF = 'deploy.kbServer.heapCeilingMb',
    MC_LEAF = 'deploy.mcServer.heapCeilingMb',
    KB_LIVE = 'runtime.kb-server.liveMemoryLimitBytes',
    KB_NONHEAP = 'runtime.kb-server.observedNonHeapBytes',
    // The live plane on 2026-08-08: 1 GiB cgroup, 768 MB declared ceiling.
    GIB     = 1024 * 1024 * 1024,
    MIB     = 1024 * 1024,
    // An ILLUSTRATIVE fixture, not a measurement. It is the gap between the observed 860.7 MiB RSS
    // and the 768 MB ceiling on that plane, which equals non-heap ONLY if the heap sat at its
    // ceiling — unestablished, and @neo-opus-grace explicitly withdrew reading her RSS numbers as
    // heap facts. The production value must come from a real observation; this constant exists so
    // the arithmetic is exercised, and no production path may derive non-heap this way.
    NON_HEAP = Math.round(92.7 * MIB),
    // Every valid transaction must now supply BOTH runtime facts. A fixture that omits the non-heap
    // observation is exercising the fail-closed path, not the happy path.
    liveContext = (nonHeapBytes = NON_HEAP) => ({[KB_LIVE]: GIB, [KB_NONHEAP]: nonHeapBytes});

test.describe('service-heap ceiling knobs — two knobs, relational bounds, no constants', () => {
    test('both knobs exist and are SEPARATE — serviceKey is singular', () => {
        expect(isKnownKnob(KB_KNOB)).toBe(true);
        expect(isKnownKnob(MC_KNOB)).toBe(true);

        // One knob addressing both servers would defeat the actuator's knob/target mismatch refusal,
        // which is keyed on this single field.
        expect(RECOVERY_KNOBS[KB_KNOB].serviceKey).toBe('kb-server');
        expect(RECOVERY_KNOBS[MC_KNOB].serviceKey).toBe('mc-server');
        expect(knobLeafPaths(KB_KNOB)).toEqual([KB_LEAF]);
        expect(knobLeafPaths(MC_KNOB)).toEqual([MC_LEAF]);
    });

    test('NO min/max constants — both bounds are relationships', () => {
        // `768` has no derivation in the repo, so a band here would be invented to match the store
        // knob's shape. This asserts the absence directly, because a constant that slipped in later
        // would still pass every behavioural test below.
        for (const knob of [KB_KNOB, MC_KNOB]) {
            for (const leaf of RECOVERY_KNOBS[knob].leaves) {
                expect(leaf.min).toBeUndefined();
                expect(leaf.max).toBeUndefined();
            }
        }
    });

    test('BOTH runtime facts are declared as context, not config', () => {
        // The non-heap observation joined the limit here after @neo-opus-grace measured that the
        // limit alone cannot express the bound. Neither is derivable from config: cgroup limits and
        // process footprints are observed at runtime by design.
        expect(knobRequiredContext(KB_KNOB)).toEqual([KB_LIVE, KB_NONHEAP]);
        expect(knobRequiredContext(MC_KNOB)).toEqual([
            'runtime.mc-server.liveMemoryLimitBytes',
            'runtime.mc-server.observedNonHeapBytes'
        ]);
    });

    test('a ceiling UNDER the limit but over it once non-heap is counted is REFUSED', () => {
        // The counterfactual for the whole fix, and the case the previous bound passed. 1000 MB is
        // strictly below a 1 GiB cgroup, so `strictly-below-container-limit` admits it — but the
        // process footprint is the ceiling PLUS non-heap, which lands at ~1092 MiB and the kernel
        // kills mid-write with no diagnostic. The old bound's own stated purpose was preventing
        // exactly this conversion, and it could not.
        const refused = validateKnobTransaction({
            knob   : KB_KNOB,
            values : {[KB_LEAF]: 1000},
            context: liveContext()
        });

        expect(refused.valid).toBe(false);

        // Run the REJECTED predicate inline, so this test proves the new bound is what refuses it
        // rather than some unrelated invariant: the old check passes the same input.
        expect(1000 * MIB < GIB).toBe(true);
        expect(1000 * MIB + NON_HEAP < GIB).toBe(false);
    });

    test('a MISSING non-heap observation refuses — zero is never assumed', () => {
        // Assuming zero non-heap is precisely what lets a ceiling one byte under the cgroup read as
        // safe. The knob therefore stays fail-closed until a service publishes the observation.
        for (const nonHeapBytes of [undefined, null, NaN, -1]) {
            const result = validateKnobTransaction({
                knob   : KB_KNOB,
                values : {[KB_LEAF]: 800},
                context: {[KB_LIVE]: GIB, [KB_NONHEAP]: nonHeapBytes}
            });

            expect(result.valid, `nonHeap=${nonHeapBytes}`).toBe(false);
        }
    });

    test('a raise strictly below the container limit is VALID', () => {
        const result = validateKnobTransaction({
            knob   : KB_KNOB,
            values : {[KB_LEAF]: 896},
            context: liveContext()
        });

        expect(result.valid).toBe(true);
        expect(result.violations ?? []).toEqual([]);
    });

    test('a ceiling AT the container limit is refused — that is the OOMKill conversion', () => {
        // 1024 MB against a 1 GiB cgroup. A clean self-abort becomes a kernel kill mid-write.
        const result = validateKnobTransaction({
            knob   : KB_KNOB,
            values : {[KB_LEAF]: 1024},
            context: liveContext()
        });

        expect(result.valid).toBe(false);
    });

    test('a ceiling ABOVE the container limit is refused', () => {
        expect(validateKnobTransaction({
            knob   : KB_KNOB,
            values : {[KB_LEAF]: 2048},
            context: liveContext()
        }).valid).toBe(false);
    });

    test('UNIT MISMATCH is caught: the leaf is MB and the bound is BYTES', () => {
        // The discriminating case for the conversion. 900 MB is below a 1 GiB limit; a comparison
        // that forgot to convert would test 900 < 1073741824 and pass everything forever, so the
        // valid arm above cannot detect it. This value is BELOW the limit in bytes and ABOVE it in
        // MB, which only a correctly-converted comparison gets right.
        expect(validateKnobTransaction({
            knob   : KB_KNOB,
            values : {[KB_LEAF]: 900},
            context: liveContext()
        }).valid).toBe(true);

        // …and 1100 MB exceeds 1 GiB only once converted. Unconverted, 1100 < 1073741824 passes.
        expect(validateKnobTransaction({
            knob   : KB_KNOB,
            values : {[KB_LEAF]: 1100},
            context: liveContext()
        }).valid).toBe(false);
    });

    test('an UNRESOLVED live limit REFUSES — an unknown bound is never an absent one', () => {
        for (const live of [undefined, null, 0, -1, NaN, 'unknown']) {
            expect(validateKnobTransaction({
                knob   : KB_KNOB,
                values : {[KB_LEAF]: 896},
                context: {[KB_LIVE]: live}
            }).valid).toBe(false);
        }
    });

    test('MISSING context refuses too — this is the fail-closed a config-only channel hits', () => {
        // A channel that resolves context from config alone cannot supply a runtime leaf, so it
        // refuses this knob. That is the intended consequence, not a gap: a controller blind to the
        // container limit must not be able to raise a ceiling past it.
        expect(validateKnobTransaction({knob: KB_KNOB, values: {[KB_LEAF]: 896}}).valid).toBe(false);
    });

    test('a non-positive or non-finite ceiling is refused by raise-not-lower', () => {
        for (const v of [0, -256, NaN]) {
            expect(validateKnobTransaction({
                knob   : KB_KNOB,
                values : {[KB_LEAF]: v},
                context: liveContext()
            }).valid).toBe(false);
        }
    });

    test('the store knob is UNCHANGED — control against collateral edits', () => {
        expect(isKnownKnob('container-memory-ceiling')).toBe(true);
        expect(RECOVERY_KNOBS['container-memory-ceiling'].serviceKey).toBe('chroma');
        expect(knobRequiredContext('container-memory-ceiling')).toEqual(['runtime.chroma.liveMemoryLimitBytes']);
    });
});
