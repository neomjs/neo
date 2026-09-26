import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockVesselConversionTest'
    },
    // The decision owner needs no Main facade or LocalStorage addon.
    mockLocalStorage: false,
    mockMain        : false
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import VesselConversion from '../../../../src/dashboard/dock/window/VesselConversion.mjs';

/**
 * @summary The dual-window conversion sensor, driven end-to-end through its injected seams.
 *
 * Every witness pins the claim-owned contract: a live pointer claim over measurable rects converts
 * on its first sample whatever the overlap (the native title-bar path admits by a single point, and
 * a hand aiming at a target's far edge must see the same), the decision fires exactly once per
 * crossing (zero flicker while the claim stands), losing the claim reverts at any overlap,
 * observed exit evidence outranks a lapsed claim, terminals reset silently, and unmeasurable
 * geometry fails CLOSED — it never converts and it reverts an admitted conversion. The seams are
 * the decision surface; the returned sample record is the geometry surface.
 */
test.describe('Neo.dashboard.dock.window.VesselConversion', () => {
    const sensors      = [];
    const createSensor = (config, cls=VesselConversion) => {
        const sensor = Neo.create(cls, config);
        sensors.push(sensor);
        return sensor
    };

    test.afterEach(() => sensors.splice(0).forEach(sensor => sensor.destroy()));

    const harness = (config = {}) => {
        const calls = {converted: [], reverted: []};

        const sensor = createSensor({
            onConvertIn: record => {
                calls.converted.push(record);
                return true
            },
            onConvertOut: record => {
                calls.reverted.push(record);
                return true
            },
            ...config
        });

        return {calls, sensor}
    };

    const rect = (x, y, width, height) => ({x, y, width, height});

    // Slides a 100×100 source across a 100×100 target at (0,0) along x: the overlap is 100 - bx, so
    // bx = 100 is a measurable pair with no overlap at all. Only the claim decides.
    const slideSample = (sensor, bx, pointerInTarget = true) => sensor.sample({
        pointerInTarget,
        sourceRect: rect(bx, 0, 100, 100),
        targetRect: rect(0, 0, 100, 100)
    });

    test('a policy override changes the decision without copying transition ownership', () => {
        const {sensor} = harness();
        sensor.resolveConversion = () => true;
        expect(slideSample(sensor, 99, false).converted, 'the injected policy converts without a claim').toBe(true);
        expect(sensor.transitioning).toBe(false)
    });

    test('the registered class and a subclass share lifecycle while specializing the decision', () => {
        expect(Neo.ns('Neo.dashboard.dock.window.VesselConversion')).toBe(VesselConversion);
        class NeverConvert extends VesselConversion {
            static config = {className: 'Test.Unit.Dashboard.VesselConversion.NeverConvert'};
            resolveConversion() { return false }
        }
        const sensor = createSensor({onConvertIn: () => true, onConvertOut: () => true}, Neo.setupClass(NeverConvert));
        expect(sensor instanceof VesselConversion).toBe(true);
        expect(slideSample(sensor, 0).converted).toBe(false);
        expect(sensor.transitioning).toBe(false)
    });

    test('Neo.overwrites changes inherited policy methods before registration', () => {
        const previous = Neo.overwrites;
        class OverwrittenPolicy extends VesselConversion {
            static config = {className: 'Test.Unit.Dashboard.VesselConversion.OverwrittenPolicy'}
        }
        try {
            Neo.overwrites = {Test: {Unit: {Dashboard: {VesselConversion: {OverwrittenPolicy: {
                resolveConversion(record) { return record.measurable && !record.pointerInTarget }
            }}}}}};
            const sensor = createSensor({onConvertIn: () => true, onConvertOut: () => true}, Neo.setupClass(OverwrittenPolicy));
            expect(slideSample(sensor, 0).converted, 'the overwritten policy refuses a claim').toBe(false);
            expect(slideSample(sensor, 0, false).converted, 'and converts without one').toBe(true)
        } finally {
            Neo.overwrites = previous
        }
    });

    test('destruction unregisters the sensor and makes late admission inert', async () => {
        let finish;
        const admission = new Promise(resolve => finish = resolve),
              {sensor}  = harness({onConvertIn: () => admission}),
              id        = sensor.id,
              lookup    = () => Neo.manager?.Instance?.get(id) ?? Neo.idMap?.[id];
        expect(lookup()).toBe(sensor);
        slideSample(sensor, 0);
        const pending = sensor.transitionPromise;
        sensor.destroy();
        finish(true);
        await expect(pending).resolves.toBe(false);
        expect(sensor.isDestroyed).toBe(true);
        expect(sensor.converted).toBe(false);
        expect(sensor.transitioning).toBe(false);
        expect(lookup()).toBeFalsy()
    });

    test('invalid policy is rejected before an instance id is registered', () => {
        const id = 'invalid-vessel-policy-18388';
        expect(() => createSensor({id, onConvertIn: 'admit', onConvertOut: () => true})).toThrow(/required function seams/);
        expect(Neo.manager?.Instance?.get(id) ?? Neo.idMap?.[id]).toBeFalsy()
    });

    test('a live claim converts on its first sample at ANY overlap — small over large, large over small, near-equal, extreme aspect, and none at all', () => {
        const pairs = [
            {name: 'small source fully over a large target', source: rect(100, 100, 200, 150), target: rect(0, 0, 1200, 800)},
            {name: 'large source fully covering a small target', source: rect(0, 0, 1200, 800), target: rect(300, 200, 200, 150)},
            {name: 'near-equal windows aligned', source: rect(0, 0, 640, 480), target: rect(0, 0, 600, 500)},
            {name: 'extreme aspect ratios crossing', source: rect(0, 300, 1600, 200), target: rect(100, 0, 300, 900)},
            // the far-edge case a hand reaches: the pointer is inside, the frame barely is
            {name: 'a corner touch at the target\'s far edge', source: rect(690, 420, 320, 240), target: rect(0, 0, 700, 433)},
            // a frame the geometry publisher has not caught up with yet: no overlap, still a claim
            {name: 'a lagging frame with no overlap', source: rect(900, 900, 320, 240), target: rect(0, 0, 700, 433)}
        ];

        for (const {name, source, target} of pairs) {
            const {calls, sensor} = harness();
            const record          = sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: target});

            expect(record.measurable, `${name}: both rects are measurable`).toBe(true);
            expect(record, `${name}: the record carries no overlap ratio`).not.toHaveProperty('composed');
            expect(calls.converted, `${name}: the claim converts`).toHaveLength(1);
            expect(sensor.converted).toBe(true)
        }
    });

    test('single-fire: one convert-in on the claim, silence while it stands whatever the overlap does, one convert-out on its loss', () => {
        const {calls, sensor} = harness();

        // the claim arrives with the frame still mostly outside: converts exactly once
        slideSample(sensor, 90);
        expect(calls.converted).toHaveLength(1);
        expect(sensor.converted).toBe(true);

        // the frame slides in, out, and fully out of overlap under a standing claim: zero events
        [50, 0, 60, 100].forEach(bx => slideSample(sensor, bx));
        expect(calls.converted).toHaveLength(1);
        expect(calls.reverted).toHaveLength(0);

        // the claim is lost at full overlap: convert-out exactly once
        slideSample(sensor, 0, false);
        expect(calls.reverted).toHaveLength(1);
        expect(sensor.converted).toBe(false);

        // still no claim: silent
        slideSample(sensor, 0, false);
        expect(calls.reverted).toHaveLength(1)
    });

    test('pointer gate, both directions: overlap alone never converts, and overlap alone never HOLDS a conversion', () => {
        const {calls, sensor} = harness();
        const source          = rect(0, 0, 100, 100),
              target          = rect(0, 0, 100, 100);

        // full overlap, pointer outside: no conversion, ever
        for (let i = 0; i < 3; i++) {
            const record = sensor.sample({pointerInTarget: false, sourceRect: source, targetRect: target});
            expect(record.measurable).toBe(true);
            expect(record.converted).toBe(false)
        }
        expect(calls.converted).toHaveLength(0);

        // pointer enters: converts
        sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: target});
        expect(calls.converted).toHaveLength(1);

        // pointer leaves at UNCHANGED full overlap: reverts — the gate holds the conversion, not the rects
        sensor.sample({pointerInTarget: false, sourceRect: source, targetRect: target});
        expect(calls.reverted).toHaveLength(1);
        expect(calls.reverted[0].measurable, 'reversion happened at full rect overlap').toBe(true);
        expect(calls.reverted[0].sourceRect, 'the out record anchors the resume rect').toBe(source);

        // pointer re-enters: re-converts
        sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: target});
        expect(calls.converted).toHaveLength(2)
    });

    test('live geometry is re-read per sample: a target that collapses mid-gesture reverts, and one that returns re-converts on the standing claim', () => {
        const {calls, sensor} = harness();
        const source          = rect(60, 0, 100, 100);

        sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: rect(0, 0, 100, 100)});
        expect(calls.converted).toHaveLength(1);

        // the target's live rect degenerates (a window mid-resize publishes a zero width): revert
        expect(sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: rect(0, 0, 0, 100)}).measurable).toBe(false);
        expect(calls.reverted).toHaveLength(1);
        expect(sensor.converted).toBe(false);

        // the next sample carries a real rect again: the claim converts once more
        sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: rect(0, 0, 80, 100)});
        expect(calls.converted).toHaveLength(2)
    });

    test('reset is SILENT and idempotent: no seam emission, and the next gesture decides fresh', () => {
        const {calls, sensor} = harness();
        const source          = rect(0, 0, 100, 100),
              target          = rect(0, 0, 100, 100);

        sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: target});
        expect(calls.converted).toHaveLength(1);

        sensor.reset();
        sensor.reset(); // idempotent — a second terminal cleanup pass is harmless

        expect(sensor.converted).toBe(false);
        expect(calls.reverted, 'terminals belong to the outcome machine — reset never actuates').toHaveLength(0);

        // the next gesture's crossing re-fires cleanly
        sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: target});
        expect(calls.converted).toHaveLength(2)
    });

    test('garbage geometry fails CLOSED: degenerate and non-finite rects are unmeasurable, never convert, and REVERT a converted sensor', () => {
        const {calls, sensor} = harness();

        // zero-extent target: unmeasurable, no conversion
        expect(sensor.sample({pointerInTarget: true, sourceRect: rect(0, 0, 100, 100), targetRect: rect(0, 0, 0, 100)}).measurable).toBe(false);

        // missing rects: unmeasurable, no throw
        expect(sensor.sample({pointerInTarget: true, sourceRect: rect(0, 0, 100, 100)}).measurable).toBe(false);
        expect(sensor.sample().measurable).toBe(false);
        expect(calls.converted).toHaveLength(0);

        // convert legitimately, then feed NaN: NaN comparisons would freeze the conversion — the
        // fail-closed measurability gate reads garbage as "no geometry" and reverts instead
        sensor.sample({pointerInTarget: true, sourceRect: rect(0, 0, 100, 100), targetRect: rect(0, 0, 100, 100)});
        expect(sensor.converted).toBe(true);

        sensor.sample({pointerInTarget: true, sourceRect: rect(NaN, 0, 100, 100), targetRect: rect(0, 0, 100, 100)});
        expect(sensor.converted).toBe(false);
        expect(calls.reverted).toHaveLength(1);
        expect(calls.reverted[0].measurable).toBe(false)
    });

    test('the convert-in record carries the full geometry + gate truth for the actuator', () => {
        const {calls, sensor} = harness();
        const source          = rect(10, 20, 300, 200),
              target          = rect(0, 0, 1000, 700);

        sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: target});

        expect(calls.converted[0]).toEqual({
            converted      : true,
            measurable     : true,
            pointerInTarget: true,
            sourceRect     : source,
            targetRect     : target
        })
    });

    test('an async transition is provisional until strict true, and refusal preserves the prior decision', async () => {
        let resolveIn;

        const admission = new Promise(resolve => resolveIn = resolve),
              {sensor}  = harness({onConvertIn: () => admission}),
              record    = slideSample(sensor, 0);

        expect(record).toMatchObject({converted: false, transitioning: true});
        expect(sensor.converted).toBe(false);
        expect(sensor.targetConverted).toBe(true);

        resolveIn(false);
        await sensor.transitionPromise;

        expect(sensor.converted).toBe(false);
        expect(sensor.transitioning).toBe(false)
    });

    test('async reversion refusal keeps conversion ownership and may be retried', async () => {
        const outcomes        = [Promise.resolve(false), Promise.resolve(true)],
              {calls, sensor} = harness({onConvertOut: record => {
                  calls.reverted.push(record);
                  return outcomes.shift()
              }});

        slideSample(sensor, 0);
        expect(sensor.converted).toBe(true);

        expect(slideSample(sensor, 0, false)).toMatchObject({converted: true, transitioning: true});
        await sensor.transitionPromise;
        expect(sensor.converted, 'a refused re-show cannot clear conversion ownership').toBe(true);

        slideSample(sensor, 0, false);
        await sensor.transitionPromise;

        expect(sensor.converted).toBe(false);
        expect(calls.reverted).toHaveLength(2)
    });

    test('reset invalidates an older async completion so it cannot mutate the next gesture', async () => {
        let resolveIn;

        const admission = new Promise(resolve => resolveIn = resolve),
              {sensor}  = harness({onConvertIn: () => admission});

        slideSample(sensor, 0);
        sensor.reset();
        resolveIn(true);
        await admission;
        await Promise.resolve();

        expect(sensor.converted).toBe(false);
        expect(sensor.transitioning).toBe(false)
    });

    test('config validation fails LOUD: missing or non-function seams', () => {
        expect(() => createSensor({onConvertIn: () => {}}))
            .toThrow(/required function seams/);
        expect(() => createSensor({onConvertIn: () => {}, onConvertOut: 'restore'}))
            .toThrow(/required function seams/);
        expect(() => createSensor({onConvertOut: () => {}}))
            .toThrow(/required function seams/)
    });

    // `pointerInTarget` is the claim arbiter's LIVE resolution and a claim expires 300ms after its
    // last refresh, so it answers "is there a live claim?" — not "is the pointer inside?". A
    // stationary pointer fires no move events, so an ordinary human pause lets the claim lapse
    // while the vessel sits fully inside the target. `pointerExitedTarget` is the tri-state that
    // separates the two, and its ABSENT state is the one that matters most.
    test.describe('a lapsed claim is not a departure', () => {
        const source = rect(0, 0, 100, 100),
              target = rect(0, 0, 100, 100);

        const converted = () => {
            const h = harness();
            h.sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: target});
            expect(h.calls.converted).toHaveLength(1);
            return h
        };

        test('an observed still-inside HOLDS the conversion through a lapsed claim — the flicker fix', () => {
            const {calls, sensor} = converted();

            // The pause: the claim has lapsed (pointerInTarget false) but the host observed that
            // the pointer never left. Measured behaviour before the fix: converted flips
            // true→false→true per pause, a visible flicker on every hover.
            for (let i = 0; i < 5; i++) {
                const record = sensor.sample({
                    pointerExitedTarget: false,
                    pointerInTarget    : false,
                    sourceRect         : source,
                    targetRect         : target
                });
                expect(record.measurable).toBe(true);
                expect(record.converted).toBe(true)
            }

            expect(calls.reverted, 'a lapsed claim must not revert a converted vessel').toHaveLength(0)
        });

        test('an observed exit reverts, even while the rects still fully overlap', () => {
            const {calls, sensor} = converted();

            sensor.sample({
                pointerExitedTarget: true,
                pointerInTarget    : false,
                sourceRect         : source,
                targetRect         : target
            });

            expect(calls.reverted).toHaveLength(1);
            expect(calls.reverted[0].measurable, 'reversion happened at full rect overlap').toBe(true)
        });

        test('an ABSENT signal falls back to the landed contract — losing the claim reverts', () => {
            // The fail-safe that keeps every caller not yet taught the new signal on the
            // documented both-directions gate. Defaulting absence to "not exited" would let rect
            // overlap alone HOLD a conversion, deleting that gate by omission rather than by
            // decision. `null` is the same unknown as `undefined`.
            for (const absent of [undefined, null]) {
                const {calls, sensor} = converted();

                sensor.sample({
                    pointerExitedTarget: absent,
                    pointerInTarget    : false,
                    sourceRect         : source,
                    targetRect         : target
                });

                expect(calls.reverted, `an unknown exit signal (${absent}) must fail SAFE`).toHaveLength(1)
            }
        });

        test('an observed still-inside still yields to UNMEASURABLE geometry', () => {
            // Holding through a lapsed claim must not become "a vessel with no geometry stays parked".
            const {calls, sensor} = converted();

            sensor.sample({
                pointerExitedTarget: false,
                pointerInTarget    : false,
                sourceRect         : rect(NaN, 0, 100, 100),
                targetRect         : target
            });

            expect(calls.reverted, 'garbage geometry reverts regardless of the exit signal').toHaveLength(1)
        });

        test('convert-IN is unchanged: an observed still-inside never converts without a live claim', () => {
            // The asymmetry is deliberate. Holding a conversion through a lapsed claim is safe;
            // STARTING one on a claim that is not currently valid is not.
            const {calls, sensor} = harness();

            sensor.sample({
                pointerExitedTarget: false,
                pointerInTarget    : false,
                sourceRect         : source,
                targetRect         : target
            });

            expect(calls.converted, 'a lapsed claim must never pin a vessel that was never converted').toHaveLength(0)
        })
    })
});
