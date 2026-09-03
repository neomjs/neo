import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import {isDescriptor} from '../../../../src/core/ConfigSymbols.mjs';

/**
 * @summary What the config system hands two instances when a `static config` value is mutable.
 *
 * Two facts hold at once here, which is what makes this easy to argue past. A static config value
 * **is** applied at instance level — `Object.hasOwn` returns `true`, nothing falls back to a
 * prototype. And for a non-reactive key that value is the class's own `static config` object:
 * `core.Base#mergeConfig()` returns `{...staticConfig, ...config}`, a shallow spread, and
 * `processConfigs()` then assigns `me[key] = me[configSymbol][key]`. Each instance gets its own
 * property slot holding the same reference.
 *
 * So the first in-place write does not merely leak to sibling instances — it edits `ctor.config`,
 * and every instance created afterwards starts from the mutated value.
 *
 * Reactive configs are protected: the `clone` switch in the generated setter (`src/Neo.mjs`) gives
 * each instance its own value, and the getter copies arrays on the way out. The documented remedy
 * for the non-reactive case (`learn/guides/fundamentals/DeclarativeConfigMerging.md`, "always use
 * `clone: 'deep'`") does not reach it: the descriptor is accepted without error and does nothing,
 * because a key with no trailing underscore never reaches a setter.
 *
 * The reactive arms are the positive control. Without them a config system that simply did nothing
 * at all would satisfy every other assertion in this file.
 */

class PlainDefaults extends core.Base {
    static config = {
        className     : 'Test.Unit.Core.ConfigMutableDefaults.PlainDefaults',
        plainArray    : [0, 0],
        plainObject   : {a: 1},
        reactiveArray_: [0, 0]
    }
}

PlainDefaults = Neo.setupClass(PlainDefaults);

class DescribedDefaults extends core.Base {
    static config = {
        className: 'Test.Unit.Core.ConfigMutableDefaults.DescribedDefaults',
        // The remedy the guide prescribes, on a NON-reactive key.
        clonedPlain: {
            [isDescriptor]: true,
            clone         : 'deep',
            value         : [0, 0]
        },
        // The identical descriptor on a reactive key, as the control.
        clonedReactive_: {
            [isDescriptor]: true,
            clone         : 'deep',
            value         : [0, 0]
        }
    }
}

DescribedDefaults = Neo.setupClass(DescribedDefaults);

test.describe('core.Base — mutable static config defaults', () => {
    test('a static config value is applied at instance level, for reactive and non-reactive alike', () => {
        const instance = Neo.create(PlainDefaults);

        // Stated first because it is true and is the half that makes the sharing surprising:
        // nothing here is falling back to a prototype value.
        expect(Object.hasOwn(instance, 'plainArray'), 'the non-reactive value is an own property').toBe(true);
        expect(instance.plainArray, 'and it carries the declared default').toEqual([0, 0]);

        // Reactive keys are accessors, so the value lives in the backing store rather than as an
        // own property. Asserted so the contrast is recorded rather than inferred.
        expect(Object.hasOwn(instance, 'reactiveArray'), 'the reactive value is reached through an accessor').toBe(false);
        expect(instance.reactiveArray, 'and also carries its declared default').toEqual([0, 0])
    });

    test('a reactive mutable default is per instance, and writing through one cannot reach another', () => {
        const a   = Neo.create(PlainDefaults),
              b   = Neo.create(PlainDefaults),
              ref = a.reactiveArray;

        expect(ref, 'the two instances hold different objects').not.toBe(b.reactiveArray);

        ref[0] = 99;

        expect(b.reactiveArray, 'the sibling is untouched').toEqual([0, 0])
    });

    // `test.fail()` rather than a skip or an inverted assertion. The arms below state the contract
    // the guide promises, so they must go RED the moment it holds — a spec asserting today's broken
    // behaviour would go red when the defect is FIXED, which is precisely backwards. Playwright
    // reports an expected failure as a pass, so this lands green and flips the day someone repairs
    // the config system, at which point the annotation comes off.
    test.describe('the contract the guide promises, not yet met', () => {
        test.fail();

        test('a non-reactive mutable default is not shared between instances', () => {
            const a = Neo.create(PlainDefaults),
                  b = Neo.create(PlainDefaults);

            expect(a.plainArray, 'two instances must not hold the same array').not.toBe(b.plainArray);
            expect(a.plainObject, 'nor the same object').not.toBe(b.plainObject)
        });

        test('writing through a non-reactive default cannot reach a sibling or the class default', () => {
            const a = Neo.create(PlainDefaults),
                  b = Neo.create(PlainDefaults);

            a.plainArray[0] = 99;

            expect(b.plainArray, 'the sibling instance is untouched').toEqual([0, 0]);
            expect(PlainDefaults.config.plainArray, 'and the class default is untouched').toEqual([0, 0])
        });

        test('a clone descriptor takes effect on a non-reactive config, or is rejected loudly', () => {
            const a = Neo.create(DescribedDefaults),
                  b = Neo.create(DescribedDefaults);

            // The control first: the identical descriptor on a reactive key does work, so this is
            // about where the descriptor is honoured, not about whether it is understood.
            expect(a.clonedReactive, 'the descriptor works on a reactive key').not.toBe(b.clonedReactive);

            expect(a.clonedPlain, 'and must not be silently inert on a non-reactive one').not.toBe(b.clonedPlain)
        })
    })
});
