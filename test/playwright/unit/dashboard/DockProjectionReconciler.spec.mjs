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
});
