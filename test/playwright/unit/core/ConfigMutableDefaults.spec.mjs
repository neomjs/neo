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
 * property slot holding the same reference, so the first in-place write edits `ctor.config` and
 * every instance created afterwards starts from the mutated value.
 *
 * The asymmetry is **not** that a `clone` descriptor works on one side and not the other. `clone`
 * defaults to `'deep'` on `Config.prototype`, so a reactive config deep-clones its value on set
 * whether or not a descriptor says so — writing `clone: 'deep'` on a reactive key changes nothing.
 * The real asymmetry is that **reactive keys have a clone path at all and non-reactive keys have
 * none**: the switch honouring `clone` lives inside the generated setter, which a key without a
 * trailing underscore never reaches. So the descriptor is redundant on one side and inert on the
 * other, and inert silently — no error, no warning, no effect.
 *
 * **Identity is not observable on a bare reactive config.** The getter copies arrays on every read
 * (`src/Neo.mjs`, the `cloneOnGet` branch and its legacy array fallback), so `a.someArray !==
 * a.someArray` for a *single* instance. Any `not.toBe` between two reads is therefore trivially
 * true and witnesses the getter, not per-instance storage — and mutating a fetched reference writes
 * into a discarded copy, so a sibling staying untouched proves nothing either. Every reactive arm
 * below pins `cloneOnGet: 'none'` to make the underlying reference observable, which is the only
 * way these assertions mean what they say.
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
        // The control pair. Both pin `cloneOnGet: 'none'` so the stored reference is observable;
        // they differ only in the clone strategy, which is the mechanism under test.
        sharedReactive_: {
            [isDescriptor]: true,
            clone         : 'none',
            cloneOnGet    : 'none',
            value         : [0, 0]
        },
        isolatedReactive_: {
            [isDescriptor]: true,
            clone         : 'deep',
            cloneOnGet    : 'none',
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

    test('a bare reactive array config returns a fresh copy on every read, so identity proves nothing', () => {
        const instance = Neo.create(PlainDefaults);

        // This arm exists to make a trap explicit rather than to test a feature. A single instance
        // fails an identity check against itself, so `expect(a.x).not.toBe(b.x)` on such a config
        // passes no matter what the engine does with instances. Anyone reaching for that assertion
        // should land here first.
        expect(instance.reactiveArray, 'two reads of ONE instance already differ')
            .not.toBe(instance.reactiveArray)
    });

    test('the clone strategy is what separates reactive instances, and removing it collapses them', () => {
        const a = Neo.create(DescribedDefaults),
              b = Neo.create(DescribedDefaults);

        // `clone: 'none'` — no copy on set, so both instances hold the class default itself.
        // This half must SHARE. If it ever stops sharing, the pairing below is no longer measuring
        // the clone strategy and this file needs revisiting.
        expect(a.sharedReactive, 'clone:none leaves both instances on one object').toBe(b.sharedReactive);
        expect(a.sharedReactive, 'which is the class default itself')
            .toBe(DescribedDefaults.config.sharedReactive);

        // `clone: 'deep'` — copied on set, so each instance owns its value.
        expect(a.isolatedReactive, 'clone:deep gives each instance its own').not.toBe(b.isolatedReactive);

        // The isolated half's `cloneOnGet: 'none'` is asserted HERE, on its own, because otherwise
        // it is individually harmless and jointly fatal. @neo-opus-grace probed each pin separately:
        // dropping it from the shared half fails an arm immediately, dropping it from the isolated
        // half left the file green — and dropping it TOGETHER with `clone: 'deep'` made the clone
        // regression itself undetectable. So someone tidying it as redundant would have got a
        // passing suite and a dead control.
        //
        // Stable identity across two reads of ONE instance is the property only this pin provides;
        // the arm above shows a bare reactive array failing exactly that check. With this assertion
        // the pin reddens on its own removal, which is what a load-bearing pin has to do.
        expect(a.isolatedReactive, 'cloneOnGet:none makes the stored reference readable at all')
            .toBe(a.isolatedReactive);

        // The behavioural consequence of each, which is what the identity checks are shorthand for.
        a.sharedReactive[0]   = 99;
        a.isolatedReactive[0] = 99;

        expect(b.sharedReactive,   'the shared half leaks to the sibling').toEqual([99, 0]);
        expect(b.isolatedReactive, 'the isolated half does not').toEqual([0, 0])
    });

    // `test.fail()` rather than a skip or an inverted assertion. The arms below state the contract
    // the guide promises, so they must go RED the moment it holds — a spec asserting today's broken
    // behaviour would go red when the defect is FIXED, which is precisely backwards. Playwright
    // reports an expected failure as a pass, so this lands green and flips the day someone repairs
    // the config system, at which point the annotation comes off.
    //
    // Nothing that serves as a control lives in here: an assertion inside an expected-failure block
    // can never go red, so it can never discriminate. The control is the arm above.
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

            expect(a.clonedPlain, 'clone:deep must not be silently inert on a non-reactive key')
                .not.toBe(b.clonedPlain)
        })
    })
});
