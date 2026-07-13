import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'DockDemoWorkspaceCTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import '../../../../../../../src/manager/Instance.mjs';
import DemoCScalePane from '../../../../../../../apps/agentos/childapps/dockdemo/view/DemoCScalePane.mjs';
import DemoCWorkspace from '../../../../../../../apps/agentos/childapps/dockdemo/view/DemoCWorkspace.mjs';

import {initialDocument} from '../../../../../../../apps/agentos/tour/demoCDenseWorkstation.mjs';

/**
 * @summary Pins the composition choices Demo C itself owns: one provider with two stores,
 * an exact 100k Turbo scale set, a growing capped feed, and stable pane/store identities
 * across a reducer-driven coarse projection. Primitive grid/Canvas stress remains in its
 * existing suites; the browser journey owns rendered continuity.
 */
test.describe.serial('AgentOS.childapps.dockdemo.view.DemoCWorkspace', () => {
    test('renderer-rich scale columns carry unique pooling keys', () => {
        const dataFields = DemoCScalePane.config.columns.map(column => column.dataField);

        expect(new Set(dataFields).size).toBe(dataFields.length);
        expect(DemoCScalePane.config.body.bufferRowRange * DemoCScalePane.config.rowHeight)
            .toBeGreaterThanOrEqual(0.28 * 1440)
    });

    test('provider-owned stores and cached data panes survive split + return', async () => {
        const workspace = Neo.create(DemoCWorkspace, {});

        try {
            const
                provider   = workspace.getStateProvider(),
                scaleStore = provider.getStore('scale'),
                feedStore  = provider.getStore('feed'),
                scalePane  = workspace.resolvePane('scale', initialDocument.items.scale),
                feedPane   = workspace.resolvePane('feed', initialDocument.items.feed),
                feedBefore = feedStore.count;

            expect(scaleStore.className).toBe('AgentOS.childapps.dockdemo.store.DemoCScale');
            expect(feedStore.className).toBe('AgentOS.childapps.dockdemo.store.DemoCFeed');
            expect(scaleStore.count).toBe(100000);
            expect(scaleStore.autoInitRecords).toBe(false);
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
            expect(DemoCWorkspace.FEED_BATCH_SIZE * 1000 / DemoCWorkspace.FEED_INTERVAL_MS).toBe(10);

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
