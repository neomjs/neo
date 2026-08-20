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

const createSplitModel = () => ({
    schema: 'neo.harness.dockZone.v1',
    root  : 'root-split',
    items : {
        alpha: {componentRef: 'alpha', kind: 'panel', title: 'Alpha'},
        beta : {componentRef: 'beta',  kind: 'panel', title: 'Beta'}
    },
    nodes: {
        'alpha-tabs': {activeItemId: 'alpha', items: ['alpha'], type: 'tabs'},
        'beta-tabs' : {activeItemId: 'beta', items: ['beta'], type: 'tabs'},
        'root-split': {
            children   : ['alpha-tabs', 'beta-tabs'],
            orientation: 'horizontal',
            sizes      : [0.6, 0.4],
            type       : 'split'
        }
    }
});

const createThreeChildSplitModel = () => {
    const model = createSplitModel();

    model.items.gamma = {componentRef: 'gamma', kind: 'panel', title: 'Gamma'};
    model.nodes['gamma-tabs'] = {activeItemId: 'gamma', items: ['gamma'], type: 'tabs'};
    model.nodes['root-split'].children.push('gamma-tabs');
    model.nodes['root-split'].sizes = [0.4, 0.35, 0.25];

    return model
};

const reconcileModel = async (model, mutate, {geometryOnly=false, preserveItemIds=[], retainTopology=false}={}) => {
    const
        panes = Object.fromEntries(Object.entries(model.items)
            .map(([itemId, item]) => [itemId, Neo.create(Component, {header: {text: item.title}})])),
        host = Neo.create(Container, {
            items: [DockLayoutAdapter.project(model, {
                resolveComponentRef: (_componentRef, _item, itemId) => panes[itemId]
            })]
        }),
        oldShell     = host.items[0],
        nextModel    = structuredClone(model),
        placeholders = new Map();

    mutate(nextModel);

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

    let stagedCount = 0;

    const result = await DockProjectionReconciler.reconcileProjection({
        geometryOnly,
        host,
        nextConfig,
        placeholders,
        preserveItemIds,
        retainTopology,
        resolveItem: itemId => panes[itemId],
        onProjectionStaged() {
            stagedCount++
        }
    });

    return {host, nextModel, oldShell, panes, result, stagedCount}
};

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

    test('retained tab reconciliation preserves a flat action rail outside semantic tab exactness', async () => {
        const
            model = createRootTabsModel(),
            panes = {
                alpha: Neo.create(Component, {header: {text: 'Alpha'}}),
                beta : Neo.create(Component, {header: {text: 'Beta'}})
            },
            host = Neo.create(Container, {
                items: [DockLayoutAdapter.project(model, {
                    resolveComponentRef: (_componentRef, _item, itemId) => panes[itemId]
                })]
            }),
            tab          = host.items[0],
            bar          = tab.getTabBar(),
            next         = structuredClone(model),
            placeholders = new Map();

        tab.headerActions = [{action: 'pin', contextual: false, iconCls: 'fa fa-thumbtack'}];

        const action = tab.getActionItem('pin'),
              spacer = bar.getActionSpacer();

        next.items.beta = {componentRef: 'beta', kind: 'panel', title: 'Beta'};
        next.nodes['root-tabs'].items.push('beta');

        try {
            const nextConfig = DockLayoutAdapter.project(next, {
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
                resolveItem: itemId => panes[itemId]
            });
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(host.items[0]).toBe(tab);
            expect(tab.getTabButtons().map(button => button.text)).toEqual(['Alpha', 'Beta']);
            expect(tab.getActionItem('pin'), 'the exact action instance survives projection').toBe(action);
            expect(bar.getActionSpacer(), 'the exact spacer instance survives projection').toBe(spacer);
            expect(bar.items.slice(-2)).toEqual([spacer, action]);
            expect(action.wrapperCls).not.toContain('neo-draggable');
            expect(spacer.wrapperCls).not.toContain('neo-draggable');
            expect(bar.sortZone.getDraggableItems(bar.items)).toEqual(tab.getTabButtons())
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

    test('updates stable split geometry in place without moving retained tab chrome', async () => {
        const
            model = createSplitModel(),
            panes = {
                alpha: Neo.create(Component, {header: {text: 'Alpha'}}),
                beta : Neo.create(Component, {header: {text: 'Beta'}})
            },
            host = Neo.create(Container, {
                items: [DockLayoutAdapter.project(model, {
                    resolveComponentRef: (_componentRef, _item, itemId) => panes[itemId]
                })]
            }),
            oldShell     = host.items[0],
            currentTabs  = DockProjectionReconciler.collectProjectedTabs(oldShell),
            alphaTab     = currentTabs.get('alpha-tabs'),
            betaTab      = currentTabs.get('beta-tabs'),
            nextModel    = structuredClone(model),
            placeholders = new Map();

        nextModel.nodes['root-split'].sizes = [0.52, 0.48];

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

            const result = await DockProjectionReconciler.reconcileProjection({
                geometryOnly: true,
                host,
                nextConfig,
                placeholders,
                resolveItem : itemId => panes[itemId]
            });

            expect(result.nextShell).toBe(oldShell);
            expect(host.items).toEqual([oldShell]);
            expect(DockProjectionReconciler.collectProjectedTabs(oldShell))
                .toEqual(currentTabs);
            expect(currentTabs.get('alpha-tabs')).toBe(alphaTab);
            expect(currentTabs.get('beta-tabs')).toBe(betaTab);
            expect(alphaTab.flex).toBe(0.52);
            expect(betaTab.flex).toBe(0.48);
            expect(alphaTab.wrapperStyle.flex).toBe(0.52);
            expect(betaTab.wrapperStyle.flex).toBe(0.48);
            expect(placeholders.size).toBe(0)
        } finally {
            host.destroy()
        }
    });

    test('keeps same-topology non-geometry refreshes on the staged transaction by default', async () => {
        const receipt = await reconcileModel(createSplitModel(), nextModel => {
            nextModel.items.alpha.title = 'Renamed'
        });

        try {
            expect(receipt.stagedCount).toBe(1);
            expect(receipt.result.nextShell).not.toBe(receipt.oldShell)
        } finally {
            receipt.host.destroy()
        }
    });

    test('reconciles an explicit same-topology item detachment without replacing the shell', async () => {
        const model = createSplitModel();

        model.items.gamma = {componentRef: 'gamma', kind: 'panel', title: 'Gamma'};
        model.nodes['alpha-tabs'].items.push('gamma');

        const receipt = await reconcileModel(model, nextModel => {
            nextModel.nodes['alpha-tabs'].items = ['alpha']
        }, {
            preserveItemIds: ['gamma'],
            retainTopology : true
        });

        try {
            const
                alphaTab = DockProjectionReconciler.collectProjectedTabs(receipt.oldShell)
                    .get('alpha-tabs'),
                body     = alphaTab.getCardContainer(),
                bar      = alphaTab.getTabBar();

            expect(receipt.result.nextShell).toBe(receipt.oldShell);
            expect(receipt.host.items).toEqual([receipt.oldShell]);
            expect(body.items).toEqual([receipt.panes.alpha]);
            expect(bar.items.map(button => button.text)).toEqual(['Alpha']);
            expect(bar.sortZoneConfig.dockItemIds).toEqual(['alpha']);
            expect(receipt.panes.gamma.isDestroyed).toBeFalsy();
            expect(Boolean(receipt.panes.gamma.parent?.items?.includes(receipt.panes.gamma))).toBe(false);
            expect(receipt.result.reconciledItems).toBe(true);
            expect(receipt.stagedCount).toBe(1)
        } finally {
            receipt.panes.gamma.destroy();
            receipt.host.destroy()
        }
    });

    test('reconciles an explicit same-topology item arrival without replacing the shell', async () => {
        // The stack-return adoption shape: the arriving pane exists as a live instance
        // (it survived its previous workspace), the structural shell is unchanged, and one tabs
        // node's item set grows. The catalog entry without a node placement models exactly that.
        const model = createSplitModel();

        model.items.gamma = {componentRef: 'gamma', kind: 'panel', title: 'Gamma'};

        const receipt = await reconcileModel(model, nextModel => {
            nextModel.nodes['alpha-tabs'].items.push('gamma')
        }, {
            retainTopology: true
        });

        try {
            const
                alphaTab = DockProjectionReconciler.collectProjectedTabs(receipt.oldShell)
                    .get('alpha-tabs'),
                body     = alphaTab.getCardContainer(),
                bar      = alphaTab.getTabBar();

            expect(receipt.result.nextShell).toBe(receipt.oldShell);
            expect(receipt.host.items).toEqual([receipt.oldShell]);
            expect(body.items).toEqual([receipt.panes.alpha, receipt.panes.gamma]);
            expect(bar.items.map(button => button.text)).toEqual(['Alpha', 'Gamma']);
            expect(bar.sortZoneConfig.dockItemIds).toEqual(['alpha', 'gamma']);
            expect(receipt.panes.gamma.isDestroyed).toBeFalsy();
            expect(receipt.result.reconciledItems).toBe(true);
            expect(receipt.stagedCount).toBe(1)
        } finally {
            receipt.host.destroy()
        }
    });

    test('fails an explicit retained-topology admission closed when structure changes', async () => {
        const receipt = await reconcileModel(createSplitModel(), nextModel => {
            nextModel.nodes['root-split'].orientation = 'vertical'
        }, {retainTopology: true});

        try {
            expect(receipt.result.nextShell).not.toBe(receipt.oldShell);
            expect(String(receipt.result.nextShell.layout.ntype).replace(/^layout-/, '')).toBe('vbox')
        } finally {
            receipt.host.destroy()
        }
    });

    test('falls back when a geometry-only projection changes split orientation', async () => {
        const receipt = await reconcileModel(createSplitModel(), nextModel => {
            nextModel.nodes['root-split'].orientation = 'vertical'
        }, {geometryOnly: true});

        try {
            expect(receipt.stagedCount).toBe(1);
            expect(receipt.result.nextShell).not.toBe(receipt.oldShell);
            expect(String(receipt.result.nextShell.layout.ntype).replace(/^layout-/, '')).toBe('vbox')
        } finally {
            receipt.host.destroy()
        }
    });

    test('falls back when a geometry-only projection reorders three split children', async () => {
        const receipt = await reconcileModel(createThreeChildSplitModel(), nextModel => {
            nextModel.nodes['root-split'].children = ['gamma-tabs', 'alpha-tabs', 'beta-tabs']
        }, {geometryOnly: true});

        try {
            const childNodeIds = receipt.result.nextShell.items
                .filter(item => item.dockNodeType !== 'splitter')
                .map(item => item.dockNodeId);

            expect(receipt.stagedCount).toBe(1);
            expect(receipt.result.nextShell).not.toBe(receipt.oldShell);
            expect(childNodeIds).toEqual(['gamma-tabs', 'alpha-tabs', 'beta-tabs'])
        } finally {
            receipt.host.destroy()
        }
    });

    test('fails closed on duplicate structural projection identities', () => {
        expect(DockProjectionReconciler.collectProjectionTopology({
            dockNodeId  : 'root-split',
            dockNodeType: 'split',
            items       : [{
                dockNodeId  : 'duplicate-tabs',
                dockNodeType: 'tabs'
            }, {
                dockNodeId  : 'duplicate-tabs',
                dockNodeType: 'tabs'
            }]
        })).toBeNull()
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
