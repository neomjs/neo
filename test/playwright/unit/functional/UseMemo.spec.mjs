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

    test('preserves child component instances inside a memoized VDOM subtree across unrelated parent re-renders', async () => {
        let computeCount = 0;

        const ChildBadge = defineComponent({
            config: {
                className: 'Neo.Test.MemoChildBadge',
                label_   : 'Initial Badge'
            },
            createVdom(config) {
                return {
                    tag : 'span',
                    id  : config.id,
                    text: config.label
                }
            }
        });

        const ParentWithMemoChild = defineComponent({
            config: {
                className: 'Neo.Test.MemoParentWithChild',
                items_   : ['one'],
                title_   : 'Parent Title'
            },
            createVdom(config) {
                const sectionVdom = useMemo(() => {
                    computeCount++;
                    return {
                        tag: 'section',
                        id : `${config.id}-section`,
                        cn : [{
                            module: ChildBadge,
                            id    : `${config.id}-child`,
                            label : config.items[0]
                        }]
                    }
                }, [config.items]);

                return {
                    tag: 'div',
                    id : config.id,
                    cn : [
                        {tag: 'h2', id: `${config.id}-title`, text: config.title},
                        sectionVdom
                    ]
                }
            }
        });

        component = Neo.create(ParentWithMemoChild, {
            appName,
            id: `memo-child-parent-${testRun}`
        });

        await component.initVnode();
        component.mounted = true;

        const childId       = `memo-child-parent-${testRun}-child`,
              firstInstance = Neo.getComponent(childId);

        expect(computeCount).toBe(1);
        expect(firstInstance).toBeTruthy();
        expect(component.vnode.childNodes[1].childNodes[0].componentId).toBe(childId);
        expect(firstInstance.vnode.textContent).toBe('one');

        // Unrelated update hits the useMemo cache; child component must remain tracked and not throw in createDeltas
        await component.set({title: 'Updated Parent Title'});
        expect(computeCount).toBe(1);
        expect(Neo.getComponent(childId)).toBe(firstInstance);
        expect(firstInstance.isDestroyed).toBeFalsy();
        expect(component.vnode.childNodes[0].textContent).toBe('Updated Parent Title');
        expect(firstInstance.vnode.textContent).toBe('one');

        // Updating `items` invalidates the memo and updates the preserved child component
        await component.set({items: ['two']});
        await component.timeout(20);
        expect(computeCount).toBe(2);
        expect(Neo.getComponent(childId)).toBe(firstInstance);
        expect(firstInstance.vnode.textContent).toBe('two');
    });

    test('invalidates explicit-array memo when a reactive Config read inside fn changes', async () => {
        let computeCount = 0;

        const ExplicitPlusConfigComponent = defineComponent({
            config: {
                className: 'Neo.Test.MemoExplicitPlusConfig',
                items_   : ['alpha'],
                theme_   : 'light',
                title_   : 'Header'
            },
            createVdom(config) {
                const paragraphVdom = useMemo(() => {
                    computeCount++;
                    return {
                        tag : 'p',
                        id  : `${config.id}-theme`,
                        text: config.theme
                    }
                }, [config.items]);

                return {
                    tag: 'div',
                    id : config.id,
                    cn : [
                        {tag: 'h1', id: `${config.id}-title`, text: config.title},
                        paragraphVdom
                    ]
                }
            }
        });

        component = Neo.create(ExplicitPlusConfigComponent, {
            appName,
            id: `memo-explicit-config-${testRun}`
        });

        await component.initVnode();
        component.mounted = true;

        expect(computeCount).toBe(1);
        expect(component.vnode.childNodes[1].textContent).toBe('light');

        // Unrelated config change keeps the cached value
        await component.set({title: 'New Header'});
        expect(computeCount).toBe(1);
        expect(component.vnode.childNodes[1].textContent).toBe('light');

        // Changing a Config read inside `fn` invalidates the memo even when explicit `dependencies` did not change
        await component.set({theme: 'dark'});
        expect(computeCount).toBe(2);
        expect(component.vnode.childNodes[1].textContent).toBe('dark');
    });

    test('demonstrates measurable rendering speedup on an expensive VDOM subtree across unrelated state updates', async () => {
        const
            itemCount   = 8000,
            updateCount = 30;

        let unmemoizedComputes = 0,
            memoizedComputes   = 0;

        const computeExpensiveSubtree = (prefix, count) => {
            const sorted = Array.from({length: count}, (_, i) => ((i * 2654435761) >>> 0) ^ count)
                .sort((a, b) => a - b);

            let checksum = 0;

            for (let i = 0; i < sorted.length; i++) {
                checksum = (checksum + sorted[i]) | 0
            }

            return {
                tag: 'ul',
                id : `${prefix}-list`,
                cn : Array.from({length: 5}, (_, i) => ({
                    tag : 'li',
                    id  : `${prefix}-row-${i}`,
                    cls : ['row-item', i % 2 === 0 ? 'even' : 'odd'],
                    text: `Row ${i} (${checksum + i})`
                }))
            }
        };

        const UnmemoizedBench = defineComponent({
            config: {
                className: 'Neo.Test.UnmemoizedBenchComponent',
                count_   : itemCount,
                title_   : 'Start'
            },
            createVdom(config) {
                unmemoizedComputes++;
                const listVdom = computeExpensiveSubtree(config.id, config.count);

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

        const MemoizedBench = defineComponent({
            config: {
                className: 'Neo.Test.MemoizedBenchComponent',
                count_   : itemCount,
                title_   : 'Start'
            },
            createVdom(config) {
                const listVdom = useMemo(() => {
                    memoizedComputes++;
                    return computeExpensiveSubtree(config.id, config.count)
                }, [config.count]);

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

        const unmemoizedComp = Neo.create(UnmemoizedBench, {
            appName,
            id: `bench-unmemoized-${testRun}`
        });
        await unmemoizedComp.initVnode();
        unmemoizedComp.mounted = true;

        component = Neo.create(MemoizedBench, {
            appName,
            id: `bench-memoized-${testRun}`
        });
        await component.initVnode();
        component.mounted = true;

        let unmemoizedMs = 0,
            memoizedMs   = 0;

        for (let i = 1; i <= updateCount; i++) {
            const t0 = performance.now();
            await unmemoizedComp.set({title: `Title ${i}`});
            unmemoizedMs += performance.now() - t0;

            const t1 = performance.now();
            await component.set({title: `Title ${i}`});
            memoizedMs += performance.now() - t1
        }

        unmemoizedComp.destroy();

        expect(unmemoizedComputes).toBe(updateCount + 1);
        expect(memoizedComputes).toBe(1);
        expect(memoizedMs).toBeLessThan(unmemoizedMs);
    });

    test('throws if called outside a functional component createVdom effect', () => {
        expect(() => useMemo(() => 42)).toThrow(
            'useMemo must be called from within a functional component\'s createVdom method.'
        );
    });
});
