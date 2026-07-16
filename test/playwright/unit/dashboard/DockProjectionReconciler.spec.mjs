import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockProjectionReconcilerTest'
    }
});

import {test, expect}           from '@playwright/test';
import Neo                      from '../../../../src/Neo.mjs';
import * as core                from '../../../../src/core/_export.mjs';
import Component                from '../../../../src/component/Base.mjs';
import Container                from '../../../../src/container/Base.mjs';
import DockLayoutAdapter        from '../../../../src/dashboard/DockLayoutAdapter.mjs';
import DockProjectionReconciler from '../../../../src/dashboard/DockProjectionReconciler.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/button/Base.mjs';
import '../../../../src/tab/Container.mjs';
import '../../../../src/toolbar/Base.mjs';

const createRootTabsModel = () => ({
    schema: 'neo.harness.dockZone.v1',
    root  : 'root-tabs',
    items : {
        alpha: {componentRef: 'alpha', kind: 'panel', title: 'Alpha'}
    },
    nodes: {
        'root-tabs': {activeItemId: 'alpha', items: ['alpha'], type: 'tabs'}
    }
});

test.describe('Neo.dashboard.DockProjectionReconciler', () => {
    test('keys retained tab chrome and reserves only its projected destination', () => {
        const
            retainedTab = {dockNodeId: 'primary-tabs', dockNodeType: 'tabs'},
            retiredTab  = {dockNodeId: 'retired-tabs', dockNodeType: 'tabs'},
            liveShell   = {
                items: [{
                    items: [retainedTab, retiredTab]
                }]
            },
            currentTabs = DockProjectionReconciler.collectProjectedTabs(liveShell),
            plans       = new Map(),
            primary     = {
                activeIndex  : 1,
                cls          : ['primary'],
                dockNodeId   : 'primary-tabs',
                dockNodeType : 'tabs',
                flex         : 0.7,
                headerToolbar: {
                    sortZoneConfig: {dockItemIds: ['alpha', 'beta']}
                },
                items: ['projected-pane-config']
            },
            secondary = {
                activeIndex  : 0,
                dockNodeId   : 'secondary-tabs',
                dockNodeType : 'tabs',
                headerToolbar: {
                    sortZoneConfig: {dockItemIds: ['gamma']}
                },
                items: ['new-pane-config']
            },
            projection = DockProjectionReconciler.prepareTabChromeProjection({
                dockNodeId  : 'root',
                dockNodeType: 'split',
                items       : [primary, secondary]
            }, currentTabs, plans),
            retainedPlan = plans.get('primary-tabs');

        try {
            expect([...currentTabs.keys()]).toEqual(['primary-tabs', 'retired-tabs']);
            expect([...plans.keys()]).toEqual(['primary-tabs', 'secondary-tabs']);
            expect(retainedPlan).toMatchObject({
                activeIndex : 1,
                config      : primary,
                desiredItems: ['alpha', 'beta'],
                tab         : retainedTab
            });
            expect(retainedPlan.placeholder.cls).toContain('neo-dashboard-dock-projection-placeholder');
            expect(retainedPlan.placeholder.flex).toBe(0.7);
            expect(retainedPlan.placeholder.hidden).toBe(true);
            expect(retainedPlan.placeholder.hideMode).toBe('visibility');
            expect(projection.items[0]).toBe(retainedPlan.placeholder);
            expect(projection.items[1]).toBe(secondary);
            expect(plans.get('secondary-tabs').placeholder).toBeNull();
        } finally {
            retainedPlan.placeholder.destroy()
        }
    });

    test('fails closed when a live item resolver is absent', () => {
        expect(() => DockProjectionReconciler.reconcileTabChrome(
            new Map(),
            new Map(),
            new Map(),
            {items: []}
        )).toThrow('requires a live item resolver')
    });

    test('retains a root tab and discovers its live item before consulting the app resolver', async () => {
        const
            model = createRootTabsModel(),
            pane  = Neo.create(Component, {header: {text: 'Alpha'}}),
            host  = Neo.create(Container, {
                items: [DockLayoutAdapter.project(model, {
                    resolveComponentRef: () => pane
                })]
            }),
            originalTab  = host.items[0],
            placeholders = new Map();

        let resolverCalls = 0;

        try {
            const nextConfig = DockLayoutAdapter.project(model, {
                    resolveComponentRef(componentRef, item, itemId) {
                        const placeholder = Neo.create(Component, {
                            header: {text: item.title},
                            hidden: true
                        });

                        placeholders.set(itemId, placeholder);

                        return placeholder
                    }
                }),
                result = await DockProjectionReconciler.reconcileProjection({
                    host,
                    nextConfig,
                    placeholders,
                    resolveItem() {
                        resolverCalls++;
                        return null
                    }
                });

            expect(result.nextShell).toBe(originalTab);
            expect(host.items.length).toBe(1);
            expect(host.items[0]).toBe(originalTab);
            expect(originalTab.getCardContainer().items[0]).toBe(pane);
            expect(resolverCalls).toBe(0)
        } finally {
            host.destroy()
        }
    })

    test('normalizes an absent-item config to the inserted live component exactly once', async () => {
        const
            model = createRootTabsModel(),
            pane  = Neo.create(Component, {header: {text: 'Alpha'}}),
            host  = Neo.create(Container, {
                items: [DockLayoutAdapter.project(model, {
                    resolveComponentRef: () => pane
                })]
            }),
            originalTab  = host.items[0],
            nextModel    = structuredClone(model),
            placeholders = new Map();

        nextModel.items.beta = {componentRef: 'beta', kind: 'panel', title: 'Beta'};
        nextModel.nodes['root-tabs'].items.push('beta');

        const resolverCalls = [];
        let   headerCommits = 0;

        try {
            const nextConfig = DockLayoutAdapter.project(nextModel, {
                resolveComponentRef(_componentRef, item, itemId) {
                    const placeholder = Neo.create(Component, {
                        header: {text: item.title},
                        hidden: true
                    });

                    placeholders.set(itemId, placeholder);

                    return placeholder
                }
            });

            const
                bar                   = originalTab.getTabBar(),
                originalPromiseUpdate = bar.promiseUpdate.bind(bar);

            bar.promiseUpdate = (...args) => {
                headerCommits++;
                return originalPromiseUpdate(...args)
            };

            await DockProjectionReconciler.reconcileProjection({
                host,
                nextConfig,
                placeholders,
                resolveItem(itemId) {
                    resolverCalls.push(itemId);

                    const item = nextModel.items[itemId];

                    return DockLayoutAdapter.decorateProjectedItem(
                        {ntype: 'component', html: item.title},
                        itemId,
                        item
                    )
                }
            });

            const body = originalTab.getCardContainer();

            expect(host.items[0]).toBe(originalTab);
            expect(body.items[0]).toBe(pane);
            expect(body.items[1]).toBeInstanceOf(Component);
            expect(body.items[1].html).toBe('Beta');
            expect(originalTab.getTabBar().items[1].text).toBe('Beta');
            expect(originalTab.getTabBar().items[1].wrapperCls).toContain('neo-draggable');
            expect(headerCommits, 'new chrome commits once through its direct toolbar owner').toBe(1);
            expect(resolverCalls).toEqual(['beta'])
        } finally {
            host.destroy()
        }
    });

    test('retires a pane and button that are absent from every projected tab exactly once', async () => {
        const
            model = createRootTabsModel(),
            beta  = {componentRef: 'beta', kind: 'panel', title: 'Beta'};

        model.items.beta = beta;
        model.nodes['root-tabs'].items.push('beta');

        const
            panes = {
                alpha: Neo.create(Component, {header: {text: 'Alpha'}}),
                beta : Neo.create(Component, {header: {text: 'Beta'}})
            },
            host = Neo.create(Container, {
                items: [DockLayoutAdapter.project(model, {
                    resolveComponentRef: (_componentRef, _item, itemId) => panes[itemId]
                })]
            }),
            tab             = host.items[0],
            bar             = tab.getTabBar(),
            betaButton      = bar.items[1],
            betaPaneDestroy = panes.beta.destroy.bind(panes.beta),
            betaButtonDestroy = betaButton.destroy.bind(betaButton),
            nextModel       = structuredClone(model),
            placeholders    = new Map();

        let betaPaneDestroyCount   = 0,
            betaButtonDestroyCount = 0;

        panes.beta.destroy = (...args) => {
            betaPaneDestroyCount++;
            return betaPaneDestroy(...args)
        };
        betaButton.destroy = (...args) => {
            betaButtonDestroyCount++;
            return betaButtonDestroy(...args)
        };

        nextModel.nodes['root-tabs'].items = ['alpha'];

        try {
            const nextConfig = DockLayoutAdapter.project(nextModel, {
                resolveComponentRef(_componentRef, item, itemId) {
                    const placeholder = Neo.create(Component, {
                        header: {text: item.title},
                        hidden: true
                    });

                    placeholders.set(itemId, placeholder);

                    return placeholder
                }
            });

            await DockProjectionReconciler.reconcileProjection({
                host,
                nextConfig,
                placeholders,
                resolveItem: () => null
            });

            expect(host.items[0]).toBe(tab);
            expect(tab.getCardContainer().items).toEqual([panes.alpha]);
            expect(bar.items).toHaveLength(1);
            expect(betaPaneDestroyCount).toBe(1);
            expect(betaButtonDestroyCount).toBe(1)
        } finally {
            host.destroy()
        }
    })

    test('parks an absent middle pane without shifting sibling chrome and re-adopts the same instance', async () => {
        const model = createRootTabsModel();

        model.items.beta  = {componentRef: 'beta',  kind: 'panel', title: 'Beta'};
        model.items.gamma = {componentRef: 'gamma', kind: 'panel', title: 'Gamma'};
        model.nodes['root-tabs'].items = ['alpha', 'beta', 'gamma'];

        const
            panes = {
                alpha: Neo.create(Component, {header: {text: 'Alpha'}}),
                beta : Neo.create(Component, {header: {text: 'Beta'}}),
                gamma: Neo.create(Component, {header: {text: 'Gamma'}})
            },
            host = Neo.create(Container, {
                items: [DockLayoutAdapter.project(model, {
                    resolveComponentRef: (_componentRef, _item, itemId) => panes[itemId]
                })]
            }),
            tab               = host.items[0],
            originalButton    = tab.getTabBar().items[1],
            originalDestroy   = panes.beta.destroy.bind(panes.beta),
            nextModel         = structuredClone(model),
            firstPlaceholders = new Map();

        let paneDestroyCount = 0;

        panes.beta.destroy = (...args) => {
            paneDestroyCount++;
            return originalDestroy(...args)
        };
        nextModel.nodes['root-tabs'].items = ['alpha', 'gamma'];

        const project = (document, placeholders) => DockLayoutAdapter.project(document, {
            resolveComponentRef(_componentRef, item, itemId) {
                const placeholder = Neo.create(Component, {
                    header: {text: item.title},
                    hidden: true
                });

                placeholders.set(itemId, placeholder);

                return placeholder
            }
        });

        try {
            await DockProjectionReconciler.reconcileProjection({
                host,
                nextConfig     : project(nextModel, firstPlaceholders),
                placeholders   : firstPlaceholders,
                preserveItemIds: ['beta'],
                resolveItem    : itemId => panes[itemId]
            });

            let body = tab.getCardContainer(),
                bar  = tab.getTabBar();

            expect(body.items).toEqual([panes.alpha, panes.gamma]);
            expect(bar.items.map(button => button.text)).toEqual(['Alpha', 'Gamma']);
            expect(bar.sortZoneConfig.dockItemIds).toEqual(['alpha', 'gamma']);
            expect(bar.sortZone.dockItemIds).toEqual(['alpha', 'gamma']);
            expect(Boolean(panes.beta.parent?.items?.includes(panes.beta))).toBe(false);
            expect(panes.beta.isDestroyed).toBeFalsy();
            expect(originalButton.isDestroyed).toBeTruthy();
            expect(paneDestroyCount).toBe(0);

            const returnPlaceholders = new Map();

            await DockProjectionReconciler.reconcileProjection({
                host,
                nextConfig  : project(model, returnPlaceholders),
                placeholders: returnPlaceholders,
                resolveItem : itemId => panes[itemId]
            });

            body = tab.getCardContainer();
            bar  = tab.getTabBar();

            expect(body.items).toEqual([panes.alpha, panes.beta, panes.gamma]);
            expect(body.items[1]).toBe(panes.beta);
            expect(bar.items.map(button => button.text)).toEqual(['Alpha', 'Beta', 'Gamma']);
            expect(bar.items[1]).not.toBe(originalButton);
            expect(bar.items[1].wrapperCls).toContain('neo-draggable');
            expect(bar.sortZoneConfig.dockItemIds).toEqual(['alpha', 'beta', 'gamma']);
            expect(bar.sortZone.dockItemIds).toEqual(['alpha', 'beta', 'gamma']);
            expect(paneDestroyCount).toBe(0)
        } finally {
            host.destroy()
        }
    })
});
