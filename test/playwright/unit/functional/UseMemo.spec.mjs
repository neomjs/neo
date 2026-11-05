import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'FunctionalUseMemoTest'
    },
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    }
});

import {test, expect}                        from '@playwright/test';
import Neo                                   from '../../../../src/Neo.mjs';
import * as core                             from '../../../../src/core/_export.mjs';
import DomApiVnodeCreator                    from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper                            from '../../../../src/vdom/Helper.mjs';
import {defineComponent, useConfig, useMemo} from '../../../../src/functional/_export.mjs';

const appName = 'FunctionalUseMemoTest';

/**
 * @summary Tests the `useMemo` hook inside functional components for both explicit dependency arrays and automatic `Neo.core.Config` tracking.
 */
test.describe('functional/UseMemo', () => {
    let component, realApplyDeltas;
    let testRun = 0;

    test.beforeEach(() => {
        testRun++;
        realApplyDeltas = Neo.applyDeltas;
        Neo.applyDeltas = async () => {};
    });

    test.afterEach(() => {
        component?.destroy();
        component       = null;
        Neo.applyDeltas = realApplyDeltas;
    });

    test('memoizes computed VDOM subtrees with an explicit dependency array and skips recomputation when unrelated configs change', async () => {
        let computeCount = 0;

        const MemoComponent = defineComponent({
            config: {
                className: 'Neo.Test.MemoExplicitComponent',
                items_   : ['alpha', 'beta'],
                title_   : 'Initial Title'
            },
            createVdom(config) {
                const listVdom = useMemo(() => {
                    computeCount++;
                    return {
                        tag: 'ul',
                        id : `${config.id}-list`,
                        cn : config.items.map((item, idx) => ({
                            tag : 'li',
                            id  : `${config.id}-item-${idx}`,
                            text: item
                        }))
                    }
                }, [config.items]);

                return {
                    tag: 'div',
                    id : config.id,
                    cn : [
                        {tag: 'h1', id: `${config.id}-title`, text: config.title},
                        listVdom
                    ]
                }
            }
        });

        component = Neo.create(MemoComponent, {
            appName,
            id: `memo-explicit-${testRun}`
        });

        await component.initVnode();
        component.mounted = true;

        expect(computeCount).toBe(1);

        // Changing `title` re-runs `createVdom`, but `items` is unchanged so `useMemo` returns the cached subtree
        await component.set({title: 'Updated Title'});
        expect(computeCount).toBe(1);

        // Changing `items` invalidates the dependency array and recomputes the subtree
        await component.set({items: ['alpha', 'beta', 'gamma']});
        expect(computeCount).toBe(2);
        expect(component.vnode.childNodes[1].childNodes.length).toBe(3);
    });

    test('automatically tracks reactive Config reads when dependencies are omitted and preserves subscriptions across cached renders', async () => {
        let computeCount = 0,
            setTheme;

        const AutoMemoComponent = defineComponent({
            config: {
                className  : 'Neo.Test.MemoAutoComponent',
                count_     : 3,
                multiplier_: 2
            },
            createVdom(config) {
                const [theme, updateTheme] = useConfig('dark');

                setTheme = updateTheme;

                const productText = useMemo(() => {
                    computeCount++;
                    return `Result: ${config.count * config.multiplier}`
                });

                return {
                    tag: 'div',
                    id : config.id,
                    cls: [`theme-${theme}`],
                    cn : [
                        {tag: 'span', id: `${config.id}-product`, text: productText}
                    ]
                }
            }
        });

        component = Neo.create(AutoMemoComponent, {
            appName,
            id: `memo-auto-${testRun}`
        });

        await component.initVnode();
        component.mounted = true;

        expect(computeCount).toBe(1);
        expect(component.vnode.childNodes[0].textContent).toBe('Result: 6');

        // Updating `theme` re-runs `createVdom`, but `count` and `multiplier` did not change
        setTheme('light');
        await component.timeout(20);
        expect(computeCount).toBe(1);
        expect(component.vnode.className).toEqual(['theme-light']);

        // Updating `multiplier` after a cached render still triggers the effect and recomputes `useMemo`
        await component.set({multiplier: 5});
        expect(computeCount).toBe(2);
        expect(component.vnode.childNodes[0].textContent).toBe('Result: 15');

        // Updating `count` after that also recomputes `useMemo`
        await component.set({count: 4});
        expect(computeCount).toBe(3);
        expect(component.vnode.childNodes[0].textContent).toBe('Result: 20');
    });

    test('throws if called outside a functional component createVdom effect', () => {
        expect(() => useMemo(() => 42)).toThrow(
            'useMemo must be called from within a functional component\'s createVdom method.'
        );
    });
});
