import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Base           from '../../../../src/core/Base.mjs';

/**
 * Runs `fn` while collecting every `console.warn` call.
 * @param {Function} fn
 * @returns {Promise<Array[]>} The argument lists of the collected calls
 */
async function collectWarnings(fn) {
    const {warn} = console,
          calls  = [];

    console.warn = (...args) => calls.push(args);

    try {
        await fn()
    } finally {
        console.warn = warn
    }

    return calls
}

/**
 * @param {Array[]} calls
 * @param {String}  className
 * @param {String}  key
 * @returns {Number} How many collected warnings name both the class and the key
 */
function countReports(calls, className, key) {
    return calls.filter(args => {
        const text = args.join(' ');
        return text.includes(className) && text.includes(`'${key}'`)
    }).length
}

test.describe('core.Base#destroy refuses late config writes (#20080)', () => {
    test('A late write on a destroyed instance runs no hook and creates no controller; reads keep the last value', () => {
        class Counter extends Base {
            static config = {
                className: 'Test.Unit.Core.DestroyRefusesLateWrites.Counter',
                // An undefined default leaves the config without a controller until its first access
                lazy_ : undefined,
                value_: null
            }

            afterSetValue(value, oldValue) {
                this.constructor.afterSetCalls++
            }
        }

        Counter.afterSetCalls = 0;

        const CounterClass = Neo.setupClass(Counter),
              instance     = Neo.create(CounterClass, {value: 1});

        expect(CounterClass.afterSetCalls).toBe(1);

        instance.destroy();

        instance.value = 2;
        instance.lazy  = 'late';
        instance.set({value: 3});

        expect(CounterClass.afterSetCalls, 'no late write reaches a hook').toBe(1);
        expect(instance.value,             'the last value stays readable').toBe(1);
        expect(instance.getConfig('lazy'), 'a destroyed instance creates no controller').toBeUndefined();
        expect(instance.lazy,              'a config it never initialized reads as undefined').toBeUndefined()
    });

    test('id and isDestroying keep their values, and a late id write registers nothing', () => {
        class Identity extends Base {
            static config = {
                className: 'Test.Unit.Core.DestroyRefusesLateWrites.Identity'
            }

            afterSetId(value, oldValue) {
                super.afterSetId(value, oldValue);
                this.constructor.afterSetIdCalls++
            }
        }

        Identity.afterSetIdCalls = 0;

        const IdentityClass = Neo.setupClass(Identity),
              instance      = Neo.create(IdentityClass, {id: 'destroy-retires-identity'});

        expect(IdentityClass.afterSetIdCalls).toBe(1);

        instance.destroy();

        expect(instance.id,           'index cleanups key on the id after destroy').toBe('destroy-retires-identity');
        expect(instance.isDestroying, 'guards read isDestroying without isDestroyed').toBe(true);

        instance.id = 'destroy-retires-renamed';

        expect(instance.id,                   'the id takes no late write').toBe('destroy-retires-identity');
        expect(IdentityClass.afterSetIdCalls, 'a late id write registers nothing').toBe(1)
    });

    test('In development, a late write is reported once per class and key', async () => {
        class Reported extends Base {
            static config = {
                className: 'Test.Unit.Core.DestroyRefusesLateWrites.Reported',
                other_   : null,
                value_   : null
            }
        }

        const ReportedClass = Neo.setupClass(Reported),
              className     = 'Test.Unit.Core.DestroyRefusesLateWrites.Reported',
              first         = Neo.create(ReportedClass),
              second        = Neo.create(ReportedClass);

        expect(Neo.config.environment).toBe('development');

        first .destroy();
        second.destroy();

        const calls = await collectWarnings(() => {
            first .value = 1;
            first .value = 2;
            second.value = 3;
            first .other = 4
        });

        expect(countReports(calls, className, 'value'), 'once per class and key').toBe(1);
        expect(countReports(calls, className, 'other'), 'a second key is reported on its own').toBe(1)
    });

    test('Outside development, a late write is refused silently', async () => {
        class Silent extends Base {
            static config = {
                className: 'Test.Unit.Core.DestroyRefusesLateWrites.Silent',
                value_   : null
            }
        }

        const SilentClass = Neo.setupClass(Silent),
              instance    = Neo.create(SilentClass),
              environment = Neo.config.environment;

        instance.destroy();

        let calls;

        Neo.config.environment = 'dist/production';

        try {
            calls = await collectWarnings(() => {
                instance.value = 1
            })
        } finally {
            Neo.config.environment = environment
        }

        expect(calls,          'no report').toEqual([]);
        expect(instance.value, 'the write is still refused').toBeNull()
    });

    test('The destroy chain writes nothing to the instance it retired', async () => {
        class Chain extends Base {
            static config = {
                className: 'Test.Unit.Core.DestroyRefusesLateWrites.Chain'
            }
        }

        const ChainClass = Neo.setupClass(Chain),
              className  = 'Test.Unit.Core.DestroyRefusesLateWrites.Chain';

        const calls = await collectWarnings(async () => {
            // Destroyed before the microtask that sets isReady runs
            const instance = Neo.create(ChainClass);

            instance.destroy();

            await new Promise(resolve => setTimeout(resolve, 0));

            // A second call must not raise isDestroying again
            instance.destroy()
        });

        expect(countReports(calls, className, 'isReady')).toBe(0);
        expect(countReports(calls, className, 'isDestroying')).toBe(0)
    });

    test('ready() settles for an instance destroyed before it got ready', async () => {
        class Early extends Base {
            static config = {
                className: 'Test.Unit.Core.DestroyRefusesLateWrites.Early'
            }
        }

        const EarlyClass = Neo.setupClass(Early),
              instance   = Neo.create(EarlyClass),
              ready      = instance.ready().then(() => 'ready');

        instance.destroy();

        const state = await Promise.race([
            ready,
            new Promise(resolve => setTimeout(() => resolve('pending'), 100))
        ]);

        expect(state).toBe('ready')
    })
});
