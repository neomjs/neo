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
    // The live plane on 2026-08-08: 1 GiB cgroup, 768 MB declared ceiling.
    GIB     = 1024 * 1024 * 1024;

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

    test('the container limit is declared as RUNTIME context, not config', () => {
        expect(knobRequiredContext(KB_KNOB)).toEqual([KB_LIVE]);
        expect(knobRequiredContext(MC_KNOB)).toEqual(['runtime.mc-server.liveMemoryLimitBytes']);
    });

    test('a raise strictly below the container limit is VALID', () => {
        const result = validateKnobTransaction({
            knob   : KB_KNOB,
            values : {[KB_LEAF]: 896},
            context: {[KB_LIVE]: GIB}
        });

        expect(result.valid).toBe(true);
        expect(result.violations ?? []).toEqual([]);
    });

    test('a ceiling AT the container limit is refused — that is the OOMKill conversion', () => {
        // 1024 MB against a 1 GiB cgroup. A clean self-abort becomes a kernel kill mid-write.
        const result = validateKnobTransaction({
            knob   : KB_KNOB,
            values : {[KB_LEAF]: 1024},
            context: {[KB_LIVE]: GIB}
        });

        expect(result.valid).toBe(false);
    });

    test('a ceiling ABOVE the container limit is refused', () => {
        expect(validateKnobTransaction({
            knob   : KB_KNOB,
            values : {[KB_LEAF]: 2048},
            context: {[KB_LIVE]: GIB}
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
            context: {[KB_LIVE]: GIB}
        }).valid).toBe(true);

        // …and 1100 MB exceeds 1 GiB only once converted. Unconverted, 1100 < 1073741824 passes.
        expect(validateKnobTransaction({
            knob   : KB_KNOB,
            values : {[KB_LEAF]: 1100},
            context: {[KB_LIVE]: GIB}
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
                context: {[KB_LIVE]: GIB}
            }).valid).toBe(false);
        }
    });

    test('the store knob is UNCHANGED — control against collateral edits', () => {
        expect(isKnownKnob('container-memory-ceiling')).toBe(true);
        expect(RECOVERY_KNOBS['container-memory-ceiling'].serviceKey).toBe('chroma');
        expect(knobRequiredContext('container-memory-ceiling')).toEqual(['runtime.chroma.liveMemoryLimitBytes']);
    });
});
