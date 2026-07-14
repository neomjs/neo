import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkstationWorkspaceTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import FeedPane  from '../../../../../apps/workstation/view/FeedPane.mjs';
import ScalePane from '../../../../../apps/workstation/view/ScalePane.mjs';
import Workspace from '../../../../../apps/workstation/view/Workspace.mjs';

import {initialDocument} from '../../../../../apps/workstation/tour/denseWorkstation.mjs';

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
                provider   = workspace.getStateProvider(),
                scaleStore = provider.getStore('scale'),
                feedStore  = provider.getStore('feed'),
                scalePane  = workspace.resolvePane('scale', initialDocument.items.scale),
                feedPane   = workspace.resolvePane('feed', initialDocument.items.feed),
                feedBefore = feedStore.count;

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

            result = workspace.applyDockZoneOperation({
                operation : 'addTab',
                itemId    : 'security',
                tabsNodeId: 'heavy-tabs'
            });

            expect(result.errors).toEqual([]);
            workspace.onDockZoneDocumentChange(result.document);
            await workspace.refreshPromise;

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
