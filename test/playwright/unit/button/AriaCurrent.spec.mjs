import {setup} from '../../setup.mjs';

const appName = 'AriaCurrentButtonTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Button             from '../../../../src/button/Base.mjs';
import EffectButton       from '../../../../src/button/Effect.mjs';
import FunctionalButton   from '../../../../src/functional/button/Base.mjs';
import SplitButton        from '../../../../src/button/Split.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

test.describe('Button family reactive ariaCurrent_ config', () => {

    test('Neo.button.Base omits aria-current by default and projects WAI-ARIA tokens + Boolean shorthand', async () => {
        const button = Neo.create(Button, {
            appName,
            route: '/learn',
            text : 'Learn'
        });

        try {
            const {vnode} = await button.initVnode();
            button.mounted = true;

            expect(button.ariaCurrent).toBeNull();
            expect(button.vdom['aria-current']).toBeUndefined();
            expect(vnode.attributes?.['aria-current']).toBeUndefined();

            button.ariaCurrent = 'page';
            await button.promiseUpdate();
            expect(button.ariaCurrent).toBe('page');
            expect(button.vdom['aria-current']).toBe('page');
            expect(button.vnode.attributes?.['aria-current']).toBe('page');
            expect(button.toJSON().ariaCurrent).toBe('page');

            button.ariaCurrent = true;
            await button.promiseUpdate();
            expect(button.ariaCurrent).toBe('true');
            expect(button.vdom['aria-current']).toBe('true');
            expect(button.vnode.attributes?.['aria-current']).toBe('true');

            button.ariaCurrent = false;
            await button.promiseUpdate();
            expect(button.ariaCurrent).toBeNull();
            expect(button.vdom['aria-current']).toBeUndefined();
            expect(button.vnode.attributes?.['aria-current']).toBeUndefined();

            for (const token of ['step', 'location', 'date', 'time']) {
                button.ariaCurrent = token;
                expect(button.ariaCurrent).toBe(token);
                expect(button.vdom['aria-current']).toBe(token)
            }
        } finally {
            button.destroy()
        }
    });

    test('Neo.button.Base rejects invalid ariaCurrent values, survives tag transitions, and clones cleanly', async () => {
        const errors        = [],
              originalError = console.error;

        console.error = (...args) => errors.push(args);

        const button = Neo.create(Button, {
            appName,
            ariaCurrent: 'page',
            text       : 'Docs'
        });

        let clone;

        try {
            const {vnode} = await button.initVnode();
            button.mounted = true;

            expect(vnode.nodeName).toBe('button');
            expect(vnode.attributes?.['aria-current']).toBe('page');

            button.ariaCurrent = 'not-a-valid-token';
            expect(button.ariaCurrent).toBe('page');
            expect(errors.length).toBe(1);

            await button.set({route: '/docs'});
            expect(button.vdom.tag).toBe('a');
            expect(button.vdom['aria-current']).toBe('page');

            await button.set({route: null});
            expect(button.vdom.tag).toBe('button');
            expect(button.vdom['aria-current']).toBe('page');

            clone = Neo.cloneNeoInstance(button);
            expect(clone.ariaCurrent).toBe('page');
            expect(clone.vdom['aria-current']).toBe('page')
        } finally {
            console.error = originalError;
            clone?.destroy();
            button.destroy()
        }
    });

    test('Neo.button.Split projects aria-current onto its primary button root, not wrapper or trigger', async () => {
        const split = Neo.create(SplitButton, {
            appName,
            ariaCurrent: 'step',
            text       : 'Step 2'
        });

        try {
            const {vnode} = await split.initVnode();
            split.mounted = true;

            expect(split.vdom['aria-current']).toBeUndefined();
            expect(split.getVdomRoot()['aria-current']).toBe('step');
            expect(vnode.childNodes[0].attributes?.['aria-current']).toBe('step');
            expect(split.triggerButton.ariaCurrent).toBeNull();
            expect(split.triggerButton.vdom['aria-current']).toBeUndefined();

            split.ariaCurrent = null;
            await split.promiseUpdate();
            expect(split.getVdomRoot()['aria-current']).toBeUndefined();
            expect(split.getVnodeRoot().attributes?.['aria-current']).toBeUndefined()
        } finally {
            split.destroy()
        }
    });

    test('Neo.button.Effect preserves aria-current across badgeText and VDOM effect re-evaluations', () => {
        const button = Neo.create(EffectButton, {
            appName,
            editRoute: false,
            route    : '/news',
            text     : 'News'
        });

        try {
            expect(button.ariaCurrent).toBeNull();
            expect(button.vdom['aria-current']).toBeUndefined();

            button.ariaCurrent = 'page';
            expect(button.ariaCurrent).toBe('page');
            expect(button.vdom['aria-current']).toBe('page');

            // Changing badgeText re-runs getVdomConfig(); reactive ariaCurrent must survive it.
            button.badgeText = '42';
            expect(button.vdom['aria-current']).toBe('page');

            button.ariaCurrent = false;
            expect(button.ariaCurrent).toBeNull();
            expect(button.vdom['aria-current']).toBeUndefined()
        } finally {
            button.destroy()
        }
    });

    test('Neo.functional.button.Base projects ariaCurrent and retains it across reactive VDOM rebuilds', async () => {
        const button = Neo.create(FunctionalButton, {
            appName,
            editRoute: false,
            route    : '/examples',
            text     : 'Examples'
        });

        try {
            await button.ready();
            expect(button.ariaCurrent).toBeNull();
            expect(button.vdom['aria-current']).toBeUndefined();

            button.ariaCurrent = 'page';
            await expect.poll(() => button.vdom['aria-current']).toBe('page');

            button.badgeText = '7';
            await expect.poll(() => button.vdom.cn[2]?.text).toBe('7');
            expect(button.vdom['aria-current']).toBe('page');

            button.ariaCurrent = false;
            await expect.poll(() => button.vdom['aria-current']).toBeUndefined();
            expect(button.ariaCurrent).toBeNull()
        } finally {
            button.destroy()
        }
    });

    test('Button, EffectButton, and FunctionalButton share identical ariaCurrent normalization and enum validation', async () => {
        const cases = [
            {input: 'page',     expectedConfig: 'page',     expectedAttr: 'page'},
            {input: 'step',     expectedConfig: 'step',     expectedAttr: 'step'},
            {input: 'location', expectedConfig: 'location', expectedAttr: 'location'},
            {input: 'date',     expectedConfig: 'date',     expectedAttr: 'date'},
            {input: 'time',     expectedConfig: 'time',     expectedAttr: 'time'},
            {input: true,       expectedConfig: 'true',     expectedAttr: 'true'},
            {input: 'bogus',    expectedConfig: 'true',     expectedAttr: 'true', errors: 1},
            {input: false,      expectedConfig: null,       expectedAttr: undefined},
            {input: null,       expectedConfig: null,       expectedAttr: undefined}
        ];

        const originalError = console.error;
        let   errors        = 0;
        console.error = () => {errors++};

        try {
            for (const ButtonClass of [Button, EffectButton, FunctionalButton]) {
                const instance = Neo.create(ButtonClass, {appName, text: 'Nav'});

                try {
                    await instance.ready?.();

                    for (const row of cases) {
                        const beforeErrors = errors;
                        instance.ariaCurrent = row.input;

                        if (ButtonClass === FunctionalButton) {
                            await expect.poll(() => instance.vdom['aria-current']).toBe(row.expectedAttr)
                        } else {
                            expect(instance.vdom['aria-current']).toBe(row.expectedAttr)
                        }

                        expect(instance.ariaCurrent).toBe(row.expectedConfig);
                        expect(errors - beforeErrors).toBe(row.errors || 0)
                    }
                } finally {
                    instance.destroy()
                }
            }
        } finally {
            console.error = originalError
        }
    });
});
