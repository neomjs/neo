import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkstationWorkspaceTest'
    }
});

import {test, expect}           from '@playwright/test';
import Neo                      from '../../../../../src/Neo.mjs';
import * as core                from '../../../../../src/core/_export.mjs';
import DockProjectionReconciler from '../../../../../src/dashboard/DockProjectionReconciler.mjs';
import '../../../../../src/manager/Instance.mjs';
import FeedPane  from '../../../../../apps/workstation/view/FeedPane.mjs';
import ScalePane from '../../../../../apps/workstation/view/ScalePane.mjs';
import Workspace from '../../../../../apps/workstation/view/Workspace.mjs';

import {initialDocument} from '../../../../../apps/workstation/tour/denseWorkstation.mjs';

/**
 * @summary Captures object identities for every live logical tab surface in one Workstation shell.
 * @param {Workstation.view.Workspace} workspace
 * @returns {Map<String,Object>}
 */
const readTabChrome = workspace => {
    const
        shell        = workspace.getReference('dock-host').items[0],
        itemIdByPane = new Map(Object.entries(workspace.paneCache).map(([itemId, pane]) => [pane, itemId]));

    return new Map([...DockProjectionReconciler.collectProjectedTabs(shell)].map(([nodeId, tab]) => {
        const
            bar     = tab.getTabBar(),
            body    = tab.getCardContainer(),
            buttons = new Map(body.items.map((pane, index) => [itemIdByPane.get(pane), bar.items[index]]));

        return [nodeId, {
            bar,
            body,
            buttons,
            overflow: bar.getPlugin('tab-overflow'),
            strip   : tab.getTabStrip(),
            tab
        }]
    }))
};

/**
 * @summary Pins the composition choices Workstation itself owns: one provider with two stores,
 * an exact 100k Turbo scale set, a growing capped feed, and stable pane/store identities
 * across a reducer-driven coarse projection. Primitive grid/Canvas stress remains in its
 * existing suites; the browser journey owns rendered continuity.
 */
test.describe.serial('Workstation.view.Workspace', () => {
    test('renderer-rich scale columns carry unique pooling keys', () => {
        const
            dataFields     = ScalePane.config.columns.map(column => column.dataField),
            feedEvent      = FeedPane.config.columns.find(column => column.dataField === 'name'),
            feedState      = FeedPane.config.columns.find(column => column.dataField === 'status'),
            feedSparkline  = FeedPane.config.columns.find(column => column.type === 'sparkline'),
            feedValue      = FeedPane.config.columns.find(column => column.dataField === 'value'),
            scaleSparkline = ScalePane.config.columns.find(column => column.type === 'sparkline');

        expect(new Set(dataFields).size).toBe(dataFields.length);
        expect(ScalePane.config.body.bufferRowRange * ScalePane.config.rowHeight)
            .toBeGreaterThanOrEqual(0.28 * 1440);
        expect(ScalePane.config.rowHeight).toBe(50);
        expect(FeedPane.config.rowHeight).toBe(50);
        expect(scaleSparkline).toMatchObject({width: 160});
        expect(scaleSparkline.flex).toBeUndefined();
        expect(feedSparkline).toMatchObject({width: 160});
        expect(feedSparkline.flex).toBeUndefined();
        expect(ScalePane.config.columnDefaults.cellAlign).toBe('left');
        expect(FeedPane.config.columnDefaults.cellAlign).toBe('left');
        expect(feedEvent).toMatchObject({flex: 2, minWidth: 280});
        expect(feedState).toMatchObject({flex: 1, minWidth: 140});
        expect(feedValue).toMatchObject({flex: 1, minWidth: 120});
        expect(initialDocument.nodes['split-main'].sizes).toEqual([0.6, 0.4])
    });

    test('provider-owned stores and cached data panes survive split + return', async () => {
        const workspace = Neo.create(Workspace, {});

        try {
            const
                provider       = workspace.getStateProvider(),
                scaleStore     = provider.getStore('scale'),
                feedStore      = provider.getStore('feed'),
                scalePane      = workspace.resolvePane('scale', initialDocument.items.scale),
                feedPane       = workspace.resolvePane('feed', initialDocument.items.feed),
                feedBefore     = feedStore.count,
                initialChrome  = readTabChrome(workspace),
                initialNodeIds = [...initialChrome.keys()],
                securityButton = initialChrome.get('heavy-tabs').buttons.get('security');

            expect(new Set(initialNodeIds)).toEqual(new Set([
                'scale-tabs', 'heavy-tabs', 'left-tabs',
                'right-top-tabs', 'right-bottom-tabs', 'bottom-tabs'
            ]));

            expect(scaleStore.className).toBe('Workstation.store.Scale');
            expect(feedStore.className).toBe('Workstation.store.Feed');
            expect(scaleStore.count).toBe(100000);
            expect(scaleStore.autoInitRecords).toBe(false);
            expect(scaleStore.items.slice(0, 20).every(record => record.trend
                .slice(1).every((value, index) => Math.abs(value - record.trend[index]) <= 4)),
                'synthetic Sparkline series stay bounded instead of wrapping across the full plot').toBe(true);
            expect(feedBefore).toBeGreaterThanOrEqual(25);

            workspace.appendFeedBatch(5);
            expect(feedStore.count).toBeGreaterThanOrEqual(feedBefore + 5);
            expect(feedStore.count).toBeLessThanOrEqual(feedStore.maxRecords);

            workspace.appendFeedBatch(600);
            expect(feedStore.count).toBe(feedStore.maxRecords);
            expect(feedStore.items[0].id)
                .toBe(`feed-${String(workspace.feedSequence).padStart(8, '0')}`);
            expect(feedStore.items.at(-1).id)
                .toBe(`feed-${String(workspace.feedSequence - feedStore.maxRecords + 1).padStart(8, '0')}`);
            expect(Workspace.FEED_BATCH_SIZE * 1000 / Workspace.FEED_INTERVAL_MS).toBe(10);

            let result = workspace.applyDockZoneOperation({
                operation   : 'splitNode',
                itemId      : 'security',
                targetNodeId: 'scale-tabs',
                orientation : 'vertical',
                edge        : 'bottom',
                sizes       : [0.72, 0.28]
            });

            expect(result.errors).toEqual([]);
            workspace.onDockZoneDocumentChange(result.document);
            await workspace.refreshPromise;

            const
                splitChrome   = readTabChrome(workspace),
                temporaryNode = splitChrome.get('tabs-security-0'),
                destroyCounts = new Map();

            expect(splitChrome.size).toBe(initialChrome.size + 1);
            expect(temporaryNode).toBeTruthy();
            expect(temporaryNode.buttons.get('security')).toBe(securityButton);
            expect(temporaryNode.body.items[0]).toBe(workspace.resolvePane('security', initialDocument.items.security));
            expect(splitChrome.get('heavy-tabs').bar.sortZoneConfig.dockItemIds)
                .toEqual(initialDocument.nodes['heavy-tabs'].items.filter(itemId => itemId !== 'security'));

            initialNodeIds.forEach(nodeId => {
                const
                    before = initialChrome.get(nodeId),
                    after  = splitChrome.get(nodeId);

                expect(after.tab, `${nodeId} keeps its tab.Container`).toBe(before.tab);
                expect(after.bar, `${nodeId} keeps its header toolbar`).toBe(before.bar);
                expect(after.body, `${nodeId} keeps its body container`).toBe(before.body);
                expect(after.strip, `${nodeId} keeps its indicator strip`).toBe(before.strip);
                expect(after.overflow, `${nodeId} keeps its Overflow plugin`).toBe(before.overflow);

                before.buttons.forEach((button, itemId) => {
                    itemId !== 'security'
                        && expect(after.buttons.get(itemId), `${itemId} keeps its tab button`).toBe(button)
                })
            });

            [
                temporaryNode.tab,
                temporaryNode.bar,
                temporaryNode.body,
                temporaryNode.strip,
                temporaryNode.overflow
            ].forEach(component => {
                const destroy = component.destroy.bind(component);

                destroyCounts.set(component, 0);
                component.destroy = (...args) => {
                    destroyCounts.set(component, destroyCounts.get(component) + 1);
                    return destroy(...args)
                }
            });

            result = workspace.applyDockZoneOperation({
                operation : 'addTab',
                itemId    : 'security',
                tabsNodeId: 'heavy-tabs'
            });

            expect(result.errors).toEqual([]);
            workspace.onDockZoneDocumentChange(result.document);
            await workspace.refreshPromise;

            const returnedChrome = readTabChrome(workspace);

            expect(returnedChrome.size).toBe(initialChrome.size);
            expect(returnedChrome.has('tabs-security-0')).toBe(false);
            expect(returnedChrome.get('heavy-tabs').buttons.get('security')).toBe(securityButton);
            expect(returnedChrome.get('heavy-tabs').bar.sortZoneConfig.dockItemIds)
                .toEqual(result.document.nodes['heavy-tabs'].items);
            expect(returnedChrome.get('heavy-tabs').tab.activeIndex)
                .toBe(result.document.nodes['heavy-tabs'].items.indexOf('security'));
            expect(securityButton.pressed).toBe(true);
            destroyCounts.forEach(count => expect(count).toBe(1));

            initialNodeIds.forEach(nodeId => {
                const
                    before = initialChrome.get(nodeId),
                    after  = returnedChrome.get(nodeId);

                expect(after.tab).toBe(before.tab);
                expect(after.bar).toBe(before.bar);
                expect(after.body).toBe(before.body);
                expect(after.strip).toBe(before.strip);
                expect(after.overflow).toBe(before.overflow);
                before.buttons.forEach((button, itemId) => {
                    expect(after.buttons.get(itemId), `${itemId} returns with its original tab button`).toBe(button)
                })
            });

            expect(workspace.resolvePane('scale', initialDocument.items.scale)).toBe(scalePane);
            expect(workspace.resolvePane('feed', initialDocument.items.feed)).toBe(feedPane);
            expect(scalePane.store).toBe(scaleStore);
            expect(feedPane.store).toBe(feedStore);
            expect(provider.getStore('scale')).toBe(scaleStore);
            expect(provider.getStore('feed')).toBe(feedStore);
            expect(scalePane.isDestroyed).toBeFalsy();
            expect(feedPane.isDestroyed).toBeFalsy()
        } finally {
            workspace.destroy()
        }
    })
});
