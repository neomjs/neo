import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockVesselConversionTest'
    },
    // The sensor is a zero-import pure module: no Main facade, no LocalStorage addon. Declaring
    // both mocks off keeps this file runnable SOLO — the mock paths call `Neo.ns`, which only
    // exists once a sibling spec has loaded the real core into the shared worker.
    mockLocalStorage: false,
    mockMain        : false
});

import {test, expect}                 from '@playwright/test';
import {createVesselConversionSensor} from '../../../../src/dashboard/dock/window/VesselConversion.mjs';

/**
 * @summary The dual-window conversion sensor, driven end-to-end through its injected seams.
 *
 * Every witness is a contract pin from the ticket's AC set: the min-axis metric is REACHABLE for
 * any size pair in both directions (the single-denominator formula it replaces provably is not),
 * the dead band fires each decision exactly once across a slow crossing (zero flicker), the
 * pointer gate holds in BOTH directions (rect overlap alone neither converts nor holds a
 * conversion), live rects renormalize per sample, terminals reset silently, and garbage geometry
 * fails CLOSED — a converted sensor fed NaN reverts instead of freezing. The seams are the
 * decision surface; the returned sample record is the geometry surface.
 */
test.describe('Neo.dashboard.dock.window.VesselConversion — createVesselConversionSensor', () => {
    const harness = (config = {}) => {
        const calls = {converted: [], reverted: []};

        const sensor = createVesselConversionSensor({
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

    // Slides a 100×100 source across a 100×100 target at (0,0) along x: composed = (100 - bx) / 100
    // (ry stays 1), so each sample's ratio is chosen directly by the source's x offset.
    const slideSample = (sensor, bx, pointerInTarget = true) => sensor.sample({
        pointerInTarget,
        sourceRect: rect(bx, 0, 100, 100),
        targetRect: rect(0, 0, 100, 100)
    });

    test('reachability: composed attains 1.0 and converts for EVERY size-pair direction — small over large, large over small, near-equal, extreme aspect', () => {
        const pairs = [
            {name: 'small source fully over a large target', source: rect(100, 100, 200, 150), target: rect(0, 0, 1200, 800)},
            {name: 'large source fully covering a small target', source: rect(0, 0, 1200, 800), target: rect(300, 200, 200, 150)},
            {name: 'near-equal windows aligned', source: rect(0, 0, 640, 480), target: rect(0, 0, 600, 500)},
            {name: 'extreme aspect ratios crossing', source: rect(0, 300, 1600, 200), target: rect(100, 0, 300, 900)}
        ];

        for (const {name, source, target} of pairs) {
            const {calls, sensor} = harness();
            const record          = sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: target});

            expect(record.composed, `${name}: the min-axis metric must reach 1.0`).toBe(1);
            expect(record.rx).toBe(1);
            expect(record.ry).toBe(1);
            expect(calls.converted, `${name}: full min-extent coverage converts`).toHaveLength(1);
            expect(sensor.converted).toBe(true)
        }
    });

    test('single-fire hysteresis: one convert-in on the crossing, silence inside the dead band, one convert-out on the retreat', () => {
        const {calls, sensor} = harness();

        // approach below the convert threshold: nothing fires
        [100, 80, 50].forEach(bx => slideSample(sensor, bx));
        expect(calls.converted).toHaveLength(0);

        // crossing at 0.60 ≥ 0.55 fires exactly once
        slideSample(sensor, 40);
        expect(calls.converted).toHaveLength(1);
        expect(sensor.converted).toBe(true);

        // jitter INSIDE the dead band (0.50, 0.40 — both between 0.35 and 0.55): zero events
        [50, 60].forEach(bx => slideSample(sensor, bx));
        expect(calls.converted).toHaveLength(1);
        expect(calls.reverted).toHaveLength(0);

        // dropping below the revert threshold (0.34 < 0.35) fires convert-out exactly once
        slideSample(sensor, 66);
        expect(calls.reverted).toHaveLength(1);
        expect(sensor.converted).toBe(false);

        // continued retreat stays silent
        slideSample(sensor, 80);
        expect(calls.reverted).toHaveLength(1)
    });

    test('threshold boundary semantics: composed exactly AT convertThreshold converts; exactly AT revertThreshold holds', () => {
        const {calls, sensor} = harness();

        slideSample(sensor, 45); // (100 - 45) / 100 = 0.55 — at-threshold converts (>=)
        expect(calls.converted).toHaveLength(1);

        slideSample(sensor, 65); // 0.35 — at-threshold is still inside the band: holds (< reverts)
        expect(calls.reverted).toHaveLength(0);
        expect(sensor.converted).toBe(true)
    });

    test('pointer gate, both directions: overlap alone never converts, and overlap alone never HOLDS a conversion', () => {
        const {calls, sensor} = harness();
        const source          = rect(0, 0, 100, 100),
              target          = rect(0, 0, 100, 100);

        // full overlap, pointer outside: no conversion, ever
        for (let i = 0; i < 3; i++) {
            const record = sensor.sample({pointerInTarget: false, sourceRect: source, targetRect: target});
            expect(record.composed).toBe(1);
            expect(record.converted).toBe(false)
        }
        expect(calls.converted).toHaveLength(0);

        // pointer enters: converts
        sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: target});
        expect(calls.converted).toHaveLength(1);

        // pointer leaves at UNCHANGED full overlap: reverts — the gate holds the conversion, not the rects
        sensor.sample({pointerInTarget: false, sourceRect: source, targetRect: target});
        expect(calls.reverted).toHaveLength(1);
        expect(calls.reverted[0].composed, 'reversion happened at full rect overlap').toBe(1);
        expect(calls.reverted[0].sourceRect, 'the out record anchors the resume rect').toBe(source);

        // pointer re-enters above threshold: re-converts
        sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: target});
        expect(calls.converted).toHaveLength(2)
    });

    test('live-rect renormalization: a mid-sequence target resize re-derives the ratios per sample', () => {
        const {calls, sensor} = harness();
        const source          = rect(60, 0, 100, 100);

        // 40px x-overlap against a 100-wide target: rx = 40 / min(100, 100) = 0.4
        const before = sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: rect(0, 0, 100, 100)});
        expect(before.composed).toBe(0.4);

        // the target resizes to 80 wide: overlap 20px, min extent 80 → rx = 0.25 — same source, new truth
        const after = sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: rect(0, 0, 80, 100)});
        expect(after.composed).toBe(0.25);

        expect(calls.converted).toHaveLength(0)
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

    test('garbage geometry fails CLOSED: degenerate and non-finite rects compose to 0, and a converted sensor REVERTS on them', () => {
        const {calls, sensor} = harness();

        // zero-extent target: composed 0, no division artifact
        expect(sensor.sample({pointerInTarget: true, sourceRect: rect(0, 0, 100, 100), targetRect: rect(0, 0, 0, 100)}).composed).toBe(0);

        // missing rects: composed 0, no throw
        expect(sensor.sample({pointerInTarget: true, sourceRect: rect(0, 0, 100, 100)}).composed).toBe(0);
        expect(sensor.sample().composed).toBe(0);
        expect(calls.converted).toHaveLength(0);

        // convert legitimately, then feed NaN: NaN comparisons would freeze the conversion — the
        // fail-closed clamp reads garbage as "no overlap" and reverts instead
        sensor.sample({pointerInTarget: true, sourceRect: rect(0, 0, 100, 100), targetRect: rect(0, 0, 100, 100)});
        expect(sensor.converted).toBe(true);

        sensor.sample({pointerInTarget: true, sourceRect: rect(NaN, 0, 100, 100), targetRect: rect(0, 0, 100, 100)});
        expect(sensor.converted).toBe(false);
        expect(calls.reverted).toHaveLength(1);
        expect(calls.reverted[0].composed).toBe(0)
    });

    test('the composition seam owns the decision: an injected composer changes the verdict, and a garbage composer fails closed', () => {
        // rx = 0.8, ry = 0.6: min composes to 0.6 (converts at 0.55) — product composes to 0.48 (does not)
        const sample = sensor => sensor.sample({
            pointerInTarget: true,
            sourceRect     : rect(20, 0, 100, 100),
            targetRect     : rect(0, 40, 100, 100)
        });

        const minSensor = harness();
        const record    = sample(minSensor.sensor);
        expect(record.rx).toBe(0.8);
        expect(record.ry).toBe(0.6);
        expect(minSensor.calls.converted).toHaveLength(1);

        const productSensor = harness({composeRatios: ({rx, ry}) => rx * ry});
        expect(sample(productSensor.sensor).composed).toBeCloseTo(0.48, 10);
        expect(productSensor.calls.converted).toHaveLength(0);

        // a composer returning non-finite output must read as 0, even at full overlap + pointer
        const garbageSensor = harness({composeRatios: () => NaN});
        const garbageRecord = garbageSensor.sensor.sample({
            pointerInTarget: true,
            sourceRect     : rect(0, 0, 100, 100),
            targetRect     : rect(0, 0, 100, 100)
        });
        expect(garbageRecord.composed).toBe(0);
        expect(garbageSensor.calls.converted).toHaveLength(0)
    });

    test('invalid geometry DOMINATES the composition seam: a finite non-min composer can never elevate a degenerate rect', () => {
        // the escape: width 0 yields rx = 0 but ry = 1 — an AVERAGING composer would read 0.5
        // and clear a 0.45 threshold. The validity gate must force 0 BEFORE composition.
        const averaging = harness({
            composeRatios   : ({rx, ry}) => (rx + ry) / 2,
            convertThreshold: 0.45,
            revertThreshold : 0.25
        });

        const degenerate = averaging.sensor.sample({
            pointerInTarget: true,
            sourceRect     : rect(0, 0, 100, 100),
            targetRect     : rect(0, 0, 0, 100)     // zero width, full-height overlap
        });

        expect(degenerate.composed, 'the composer was never consulted — invalid geometry is 0').toBe(0);
        expect(degenerate.rx).toBe(0);
        expect(degenerate.ry).toBe(0);
        expect(averaging.calls.converted).toHaveLength(0);

        // convert legitimately under the same composer, then feed the degenerate rect: REVERT
        averaging.sensor.sample({pointerInTarget: true, sourceRect: rect(0, 0, 100, 100), targetRect: rect(0, 0, 100, 100)});
        expect(averaging.sensor.converted).toBe(true);

        averaging.sensor.sample({pointerInTarget: true, sourceRect: rect(0, 0, 100, 100), targetRect: rect(0, 0, 0, 100)});
        expect(averaging.sensor.converted, 'a converted sensor fed degenerate geometry reverts').toBe(false);
        expect(averaging.calls.reverted).toHaveLength(1)
    });

    test('the convert-in record carries the full geometry + gate truth for the actuator', () => {
        const {calls, sensor} = harness();
        const source          = rect(10, 20, 300, 200),
              target          = rect(0, 0, 1000, 700);

        sensor.sample({pointerInTarget: true, sourceRect: source, targetRect: target});

        expect(calls.converted[0]).toEqual({
            composed       : 1,
            converted      : true,
            pointerInTarget: true,
            rx             : 1,
            ry             : 1,
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

        expect(slideSample(sensor, 100)).toMatchObject({converted: true, transitioning: true});
        await sensor.transitionPromise;
        expect(sensor.converted, 'a refused re-show cannot clear conversion ownership').toBe(true);

        slideSample(sensor, 100);
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

    test('config validation fails LOUD: inverted or degenerate bands, out-of-range thresholds, missing or non-function seams', () => {
        const seams = {onConvertIn: () => {}, onConvertOut: () => {}};

        expect(() => createVesselConversionSensor({...seams, convertThreshold: 0.3, revertThreshold: 0.5}))
            .toThrow(/strictly above/);
        expect(() => createVesselConversionSensor({...seams, convertThreshold: 0.4, revertThreshold: 0.4}))
            .toThrow(/strictly above/);
        expect(() => createVesselConversionSensor({...seams, convertThreshold: 1.2}))
            .toThrow(/finite number in \(0, 1\]/);
        expect(() => createVesselConversionSensor({...seams, revertThreshold: 0}))
            .toThrow(/finite number in \(0, 1\]/);
        expect(() => createVesselConversionSensor({onConvertIn: () => {}}))
            .toThrow(/required function seams/);
        expect(() => createVesselConversionSensor({...seams, composeRatios: 'min'}))
            .toThrow(/composeRatios must be a function seam/)
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
            // true→false→true per pause at composed 1.000, a visible flicker on every hover.
            for (let i = 0; i < 5; i++) {
                const record = sensor.sample({
                    pointerExitedTarget: false,
                    pointerInTarget    : false,
                    sourceRect         : source,
                    targetRect         : target
                });
                expect(record.composed).toBe(1);
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
            expect(calls.reverted[0].composed, 'reversion happened at full rect overlap').toBe(1)
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

        test('an observed still-inside still yields to a GEOMETRIC retreat', () => {
            // Holding through a lapsed claim must not become "rect overlap can never revert it".
            const {calls, sensor} = converted();

            sensor.sample({
                pointerExitedTarget: false,
                pointerInTarget    : false,
                sourceRect         : rect(90, 0, 100, 100), // rx = 10/100 = 0.1, below revertThreshold
                targetRect         : target
            });

            expect(calls.reverted, 'geometry below revertThreshold reverts regardless of the exit signal').toHaveLength(1)
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
