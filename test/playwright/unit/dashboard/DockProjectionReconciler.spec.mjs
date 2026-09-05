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
import DockLayoutAdapter        from '../../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import DockProjectionReconciler from '../../../../src/dashboard/dock/projection/Reconciler.mjs';
import DockWorkspace            from '../../../../src/dashboard/dock/Workspace.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/button/Base.mjs';
import '../../../../src/tab/Container.mjs';
import '../../../../src/toolbar/Base.mjs';

const createRootTabsModel = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root-tabs',
    items : {
        alpha: {componentRef: 'alpha', kind: 'panel', title: 'Alpha'}
    },
    nodes: {
        'root-tabs': {activeItemId: 'alpha', items: ['alpha'], type: 'tabs'}
    }
});

const createSplitModel = () => ({
    schema: 'neo.dock.zone.v1',
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

const createEdgeModel = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root-edge',
    items : {
        center: {componentRef: 'center', kind: 'panel', title: 'Center'},
        left  : {componentRef: 'left',   kind: 'panel', title: 'Left'}
    },
    nodes: {
        'center-tabs': {activeItemId: 'center', items: ['center'], type: 'tabs'},
        'left-tabs'  : {activeItemId: 'left',   items: ['left'],   type: 'tabs'},
        'root-edge'  : {
            type : 'edge-zone',
            zones: {
                center: {nodeId: 'center-tabs'},
                left  : {nodeId: 'left-tabs', extent: 0.2, resizable: true}
            }
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

test.describe('Neo.dashboard.dock.projection.Reconciler', () => {
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

        const action = tab.getAction('pin'),
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
            expect(tab.getAction('pin'), 'the exact action instance survives projection').toBe(action);
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

    test('the option the ENGINE derives for a resize is one this reconciler grants', async () => {
        // The arms around this one hand `reconcileProjection` a `geometryOnly` the test author
        // chose, which proves the reconciler honours the request but says nothing about whether
        // anything ever makes it. The workspace's derived default is the other half of that loop:
        // a consumer writing no hook gets whatever `getRefreshOptions` returns, so if the two ends
        // disagree the fast path is dead code that every arm here still passes over.
        //
        // Taking the engine's ACTUAL output rather than restating it is what closes the loop —
        // this goes red if the engine stops emitting the class, and red if the reconciler stops
        // granting it.
        const workspace = Neo.create(DockWorkspace, {});

        let options;

        try {
            options = workspace.getRefreshOptions({operation: 'resizeSplit'}, null)
        } finally {
            workspace.destroy()
        }

        expect(options, 'the engine asks for the in-place path').toEqual({geometryOnly: true});

        const receipt = await reconcileModel(createSplitModel(), nextModel => {
            nextModel.nodes['root-split'].sizes = [0.7, 0.3]
        }, options);

        try {
            // `landedInPlace` is the OUTCOME, not the request — the one read that distinguishes a
            // granted fast path from a refused one that quietly took the staged transaction.
            expect(receipt.result.landedInPlace, 'and the reconciler grants it').toBe(true);
            expect(receipt.result.nextShell, 'the live shell was kept, not swapped').toBe(receipt.oldShell);

            const currentTabs = DockProjectionReconciler.collectProjectedTabs(receipt.oldShell);

            expect(currentTabs.get('alpha-tabs').flex, 'and the new boundary actually landed').toBe(0.7);
            expect(currentTabs.get('beta-tabs').flex).toBe(0.3)
        } finally {
            receipt.host.destroy()
        }
    });

    test('updates a retained edge band to the newly committed percentage extent', async () => {
        const receipt = await reconcileModel(createEdgeModel(), nextModel => {
            nextModel.nodes['root-edge'].zones.left.extent = 0.26
        }, {geometryOnly: true});

        try {
            const
                currentTabs = DockProjectionReconciler.collectProjectedTabs(receipt.oldShell),
                leftTab     = currentTabs.get('left-tabs');

            expect(receipt.result.nextShell).toBe(receipt.oldShell);
            expect(receipt.stagedCount).toBe(0);
            expect(leftTab.width).toBe('26%');
            expect(leftTab.getVdomRoot().width).toBe('26%')
        } finally {
            receipt.host.destroy()
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
            expect(alphaTab.getTabButtons().map(button => button.text)).toEqual(['Alpha']);
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

    test.describe('#18188 a retainTopology REQUEST over a changed topology is refused', () => {
        // `retainTopology` is an admission request, not a statement of fact. A host sends it for
        // `detachItem`, and a detach CAN restructure: emptying a tabs node drops it and collapses a
        // two-child split behind it. The consumer is safe only because `reconcileStableTopology`
        // refuses — and until now nothing asserted that it does.
        //
        // What these arms witness, measured rather than assumed: the refusal is OVER-DETERMINED.
        // Removing the node-count clause, the missing-node clause, or the child-order clause on its
        // own leaves the others still refusing, and all three arms stay green. They go red once the
        // guard is weakened far enough to actually admit a changed topology — with every structural
        // clause but the missing-node one removed, one arm fails; with that one gone too, two do.
        //
        // So this block protects the CONTRACT ("a changed topology is refused") rather than any
        // single line of it. Worth stating, because a reader who assumed a one-clause mutation would
        // turn them red — as the ticket's own AC-5 did — would wrongly conclude they cover nothing.

        test('AC-1/AC-2 a detach that COLLAPSES a node falls through to the staged transaction', async () => {
            // `alpha` is the sole occupant of `alpha-tabs`, the left child of a two-child split.
            // Removing it empties the node, so the projection has FEWER structural nodes than the
            // shell — the exact case the node-count clause exists for.
            const receipt = await reconcileModel(createSplitModel(), nextModel => {
                delete nextModel.nodes['alpha-tabs'];
                delete nextModel.items.alpha;
                nextModel.root = 'beta-tabs';
                delete nextModel.nodes['root-split']
            }, {retainTopology: true});

            try {
                // AC-1: the request was REFUSED. `landedInPlace` is the honest read of the path
                // actually taken; the request itself says only what the caller hoped for.
                expect(receipt.result.landedInPlace, 'the fast path was refused').not.toBe(true);
                expect(receipt.stagedCount, 'the staged transaction ran instead').toBe(1);

                // AC-2: refusing is only half the contract. A guard that refuses AND renders wrongly
                // would satisfy the assertion above and be worthless, so the OUTCOME is asserted —
                // which node set the host ends up projecting, not which shell object carries it.
                // Shell identity is the staged path's own business and asserting it would couple
                // this arm to an implementation detail the contract does not promise.
                // The staged path leaves BOTH shells on the host — it moves the surviving nodes
                // into a fresh shell and the committing surface completes the swap and disposes the
                // source. At this layer the new shell is the host item that is not the old one;
                // identifying it by exclusion states that, where an index would just encode it.
                const newShell = receipt.host.items.find(item => item !== receipt.oldShell);

                expect(newShell, 'a fresh shell was staged').toBeTruthy();

                const tabs = DockProjectionReconciler.collectProjectedTabs(newShell);

                expect([...tabs.keys()], 'only the surviving node is projected').toEqual(['beta-tabs']);
                expect(tabs.get('beta-tabs').getTabButtons().map(button => button.text)).toEqual(['Beta'])
            } finally {
                receipt.host.destroy()
            }
        });

        test('AC-3 a node-count INCREASE is refused too, so the size clause holds both ways', async () => {
            const model = createSplitModel();

            // Catalogued but unplaced, so a live pane exists for it before the mutation adds its
            // node — the same shape the same-topology arrival arm below uses. Introducing the item
            // only in `nextModel` would leave `resolveItem` with nothing to hand back, and the arm
            // would die on pane resolution instead of testing the size clause.
            model.items.gamma = {componentRef: 'gamma', kind: 'panel', title: 'Gamma'};

            const receipt = await reconcileModel(model, nextModel => {
                nextModel.nodes['gamma-tabs'] = {activeItemId: 'gamma', items: ['gamma'], type: 'tabs'};
                nextModel.nodes['root-split'].children.push('gamma-tabs');
                nextModel.nodes['root-split'].sizes = [0.4, 0.35, 0.25]
            }, {retainTopology: true});

            try {
                expect(receipt.result.landedInPlace, 'a grown tree is not the same tree').not.toBe(true);
                expect(receipt.stagedCount).toBe(1)
            } finally {
                receipt.host.destroy()
            }
        });

        test('AC-4 CONTROL: a detach whose node SURVIVES still lands in place', async () => {
            // Without this, the arms above would stay green if the guard began refusing everything —
            // which would silently retire the fast path rather than protect it.
            const model = createSplitModel();

            model.items.gamma = {componentRef: 'gamma', kind: 'panel', title: 'Gamma'};
            model.nodes['alpha-tabs'].items.push('gamma');

            // `gamma` leaves the node but `alpha` holds it open, so the structural tree is identical
            // and the fast path is legitimately admissible. `preserveItemIds` keeps the departing
            // pane resolvable, which is the same shape a real detach uses.
            const receipt = await reconcileModel(model, nextModel => {
                nextModel.nodes['alpha-tabs'].items        = ['alpha'];
                nextModel.nodes['alpha-tabs'].activeItemId = 'alpha'
            }, {preserveItemIds: ['gamma'], retainTopology: true});

            try {
                expect(receipt.result.landedInPlace, 'the node survived, so the fast path holds').toBe(true);
                expect(receipt.result.nextShell).toBe(receipt.oldShell)
            } finally {
                receipt.panes.gamma.destroy();
                receipt.host.destroy()
            }
        })
    });

    test.describe('a rail is stable topology: item deltas land in place, rail topology changes stage', () => {
        // `createEdgeModel` with `left` auto-hidden projects the left band empty and surfaces the item on
        // a left edge rail — the smallest document whose projection carries a Rail.
        const createRailedEdgeModel = () => {
            const model = createEdgeModel();

            model.items.left.autoHidden = true;

            return model
        };

        const findRails = shell => {
            const rails = [];

            const walk = node => {
                node?.dockNodeType === 'edge-rail' && rails.push(node);
                node?.items?.forEach?.(walk)
            };

            walk(shell);

            return rails
        };

        test('a railed item-only delta lands in place and reaches the surviving rail', async () => {
            const receipt = await reconcileModel(createRailedEdgeModel(), nextModel => {
                nextModel.items.left.title = 'Left, renamed'
            }, {retainTopology: true});

            try {
                expect(receipt.result.landedInPlace, 'the item-only delta lands in place').toBe(true);
                expect(receipt.host.items, 'no staged sibling').toHaveLength(1);

                const [rail, ...moreRails] = findRails(receipt.oldShell);

                expect(rail, 'the retained shell carries its rail').toBeTruthy();
                expect(moreRails).toEqual([]);

                // Pre-fix the rail was invisible to the stable-topology walk: the request landed in
                // place and the rail kept yesterday's items — a stale rail, worse than a staged shell.
                expect(rail.railItems.map(item => item.title), 'the surviving rail received the fresh rail items').toEqual(['Left, renamed']);
                expect(rail.items.find(item => item.dockItemId === 'left')?.text, 'and reconciled its own button in place').toBe('Left, renamed');
                expect(rail.dockZoneDocument, 'the rail reads the committed document').toEqual(receipt.nextModel)
            } finally {
                receipt.host.destroy()
            }
        });

        test('a rail that changes edge is a topology change and stages a shell', async () => {
            const receipt = await reconcileModel(createRailedEdgeModel(), nextModel => {
                const zones = nextModel.nodes['root-edge'].zones;

                zones.right = zones.left;
                delete zones.left
            }, {retainTopology: true});

            try {
                // Pre-fix the walk saw the same edge-zone and center tabs on both sides and landed in
                // place, leaving the rail on the edge the document had left.
                expect(receipt.result.landedInPlace, 'the request was refused').not.toBe(true);
                expect(receipt.stagedCount, 'the staged transaction ran').toBe(1);

                const newShell = receipt.host.items.find(item => item !== receipt.oldShell);

                expect(findRails(newShell).map(rail => rail.edge), 'the fresh shell carries the rail on its new edge').toEqual(['right'])
            } finally {
                receipt.host.destroy()
            }
        });

        test('a geometry-only refresh keeps the rail and hands it the committed document', async () => {
            const receipt = await reconcileModel(createRailedEdgeModel(), nextModel => {
                nextModel.nodes['root-edge'].zones.left.extent = 0.3
            }, {geometryOnly: true});

            try {
                expect(receipt.result.nextShell).toBe(receipt.oldShell);
                expect(receipt.stagedCount).toBe(0);

                const [rail] = findRails(receipt.oldShell);

                expect(rail.railItems.map(item => item.dockItemId), 'the rail items are untouched').toEqual(['left']);
                expect(rail.dockZoneDocument, 'the rail reads the committed document').toEqual(receipt.nextModel)
            } finally {
                receipt.host.destroy()
            }
        })
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
            expect(alphaTab.getTabButtons().map(button => button.text)).toEqual(['Alpha', 'Gamma']);
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
            betaButton      = tab.getTabButtons()[1],
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
            expect(tab.getTabButtons()).toHaveLength(1);
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
            originalButton    = tab.getTabButtons()[1],
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
            expect(tab.getTabButtons().map(button => button.text)).toEqual(['Alpha', 'Gamma']);
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
            expect(tab.getTabButtons().map(button => button.text)).toEqual(['Alpha', 'Beta', 'Gamma']);
            expect(tab.getTabButtons()[1]).not.toBe(originalButton);
            expect(tab.getTabButtons()[1].wrapperCls).toContain('neo-draggable');
            expect(bar.sortZoneConfig.dockItemIds).toEqual(['alpha', 'beta', 'gamma']);
            expect(bar.sortZone.dockItemIds).toEqual(['alpha', 'beta', 'gamma']);
            expect(paneDestroyCount).toBe(0)
        } finally {
            host.destroy()
        }
    });

    /**
     * The transaction's failure path. Phases 2-4 each end in an awaited host flight, and the host
     * holds TWO shells for that whole window — so a rejection anywhere in it used to unwind out of
     * the method and leave both shells in place, the outgoing one visible and the staged one hidden,
     * with every later commit reconciling against `host.items[shellIndex]` forever.
     *
     * A rejecting flight is injected by counting `host.promiseUpdate` calls, which is what the phases
     * ARE: the first stages the shell, the second closes tab chrome, the third swaps visibility, the
     * fourth retires the old shell. Rejecting the second or third leaves the swap unlanded (the
     * outgoing shell must survive); rejecting the fourth happens after it landed (the staged shell
     * must survive and the swap simply finishes) — so the two recovery verdicts are both reachable
     * and are asserted by name rather than inferred.
     */
    const reconcileWithRejectedFlight = async rejectOnCall => {
        const
            model = createSplitModel(),
            panes = Object.fromEntries(Object.entries(model.items)
                .map(([itemId, item]) => [itemId, Neo.create(Component, {header: {text: item.title}})])),
            host  = Neo.create(Container, {
                items: [DockLayoutAdapter.project(model, {
                    resolveComponentRef: (_componentRef, _item, itemId) => panes[itemId]
                })]
            }),
            oldShell     = host.items[0],
            nextModel    = structuredClone(model),
            placeholders = new Map();

        // Any topology change that stages a second shell; the failure is about the transaction, not
        // about which mutation asked for it.
        nextModel.nodes['root-split'].sizes = [0.3, 0.7];
        nextModel.nodes['root-split'].children.reverse();

        const nextConfig = DockLayoutAdapter.project(nextModel, {
            resolveComponentRef(_componentRef, item, itemId) {
                const placeholder = Neo.create(Component, {header: {text: item.title}, hidden: true});

                placeholders.set(itemId, placeholder);

                return placeholder
            }
        });

        const original = host.promiseUpdate.bind(host);

        let calls = 0;

        host.promiseUpdate = function() {
            calls++;

            return calls === rejectOnCall
                // The shape the live report carried: a landing ancestor flight whose stored vnode
                // still references chrome an earlier phase destroyed silently.
                ? Promise.reject(new Error('util.VNode.getVnode: Component not found for id: neo-tab-header-button-10'))
                : original()
        };

        let error = null;

        try {
            await DockProjectionReconciler.reconcileProjection({
                host,
                nextConfig,
                placeholders,
                resolveItem: itemId => panes[itemId]
            })
        } catch (e) {
            error = e
        }

        host.promiseUpdate = original;

        return {calls, error, host, model, oldShell, panes}
    };

    for (const [phase, rejectOnCall, expectedRecovery, expectedSurvivor] of [
        ['2 (tab chrome)',      2, 'retired-staged', 'old'],
        ['3 (visibility swap)', 3, 'retired-staged', 'old'],
        ['4 (retire outgoing)', 4, 'completed-swap', 'staged']
    ]) {
        test(`a rejected flight in phase ${phase} leaves exactly one visible shell and reports it`, async () => {
            const {error, host, oldShell, panes} = await reconcileWithRejectedFlight(rejectOnCall);

            try {
                // The failure must still reach the caller — the recovery repairs the host, it never
                // swallows the cause. Its message is the diagnostic and must survive unwrapped.
                expect(error, 'the projection failure reaches the caller').toBeTruthy();
                expect(error.message).toContain('Component not found for id');
                expect(error.isDockProjectionFailure, 'the failure is typed so the workspace can route it').toBe(true);
                expect(error.projectionRecovery).toBe(expectedRecovery);

                // The invariant every later commit depends on: ONE shell, at shellIndex, visible.
                expect(host.items.length, 'the host holds exactly one shell').toBe(1);
                expect(host.items[0].hidden, 'the surviving shell is visible').not.toBe(true);

                expectedSurvivor === 'old'
                    ? expect(host.items[0], 'the outgoing shell survives an unlanded swap').toBe(oldShell)
                    : expect(host.items[0], 'the staged shell survives a landed swap').not.toBe(oldShell);

                // Reparent-never-recreate holds THROUGH the failure: a recovery that destroyed the
                // retired staged shell would take the panes already moved into it, which is the exact
                // promise the transaction exists to keep.
                Object.entries(panes).forEach(([itemId, pane]) => {
                    expect(pane.isDestroyed, `pane "${itemId}" survives the failed projection`).toBeFalsy()
                })
            } finally {
                host.destroy()
            }
        })
    }

    test('the next projection after a failure reconciles normally onto the surviving shell', async () => {
        const {host, model, panes} = await reconcileWithRejectedFlight(2);

        try {
            const placeholders = new Map(),
                  nextConfig   = DockLayoutAdapter.project(structuredClone(model), {
                      resolveComponentRef(_componentRef, item, itemId) {
                          const placeholder = Neo.create(Component, {header: {text: item.title}, hidden: true});

                          placeholders.set(itemId, placeholder);

                          return placeholder
                      }
                  });

            // No injected rejection this time: the repair the workspace schedules, run by hand. The
            // committed document is untouched by a failed projection, so re-projecting from it is the
            // whole repair — and it must find one shell to reconcile against, not two.
            const result = await DockProjectionReconciler.reconcileProjection({
                host, nextConfig, placeholders, resolveItem: itemId => panes[itemId]
            });

            expect(result, 'the repair projection completes').toBeTruthy();
            expect(host.items.length, 'the repair leaves one shell behind').toBe(1);
            expect(host.items[0].hidden, 'the repaired shell is visible').not.toBe(true);

            // Identity, not just presence: the repair re-parented the SAME pane instances out of the
            // detached staged shell rather than re-creating them.
            Object.entries(panes).forEach(([itemId, pane]) => {
                expect(pane.isDestroyed, `pane "${itemId}" survives the repair`).toBeFalsy();
                expect(Boolean(pane.parent), `pane "${itemId}" is parented again`).toBe(true)
            })
        } finally {
            host.destroy()
        }
    })
});
