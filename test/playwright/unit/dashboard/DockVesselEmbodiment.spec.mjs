import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DockVesselEmbodimentTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Component from '../../../../src/component/Base.mjs';
import Container from '../../../../src/container/Base.mjs';

import {createDockVesselEmbodiment} from '../../../../src/dashboard/DockVesselEmbodiment.mjs';

test.describe('Neo.dashboard.DockVesselEmbodiment (#15396)', () => {
    let embodiment, pane, source, target;

    test.beforeEach(() => {
        source = Neo.create(Container, {
            items: [
                {module: Component, html: 'before'},
                {module: Component, html: 'live'},
                {module: Component, html: 'after'}
            ]
        });
        target = Neo.create(Container, {items: []});
        pane   = source.items[1];

        embodiment = createDockVesselEmbodiment({
            resolvePane  : itemId => itemId === 'live' ? pane : null,
            resolveTarget: windowId => windowId === 'admitted-window' ? target : null
        })
    });

    test.afterEach(() => {
        embodiment?.destroy();
        source?.isDestroyed || source?.destroy();
        target?.isDestroyed || target?.destroy()
    });

    test('stages the same pane in the vessel while preserving the source card slot', async () => {
        await expect(embodiment.stage({itemId: 'live', windowId: 'admitted-window'})).resolves.toBe(true);
        expect(target.items).toEqual([pane]);
        expect(source.items).toHaveLength(3);
        expect(source.items[1]).not.toBe(pane);
        expect(source.items[1].cls).toContain('neo-dashboard-dock-vessel-placeholder');
        expect(embodiment.isStaged('live')).toBe(true)
    });

    test('restores through the placeholder live index after sibling structure shifts', async () => {
        await embodiment.stage({itemId: 'live', windowId: 'admitted-window'});
        source.insert(0, {module: Component, html: 'new first'}, true);

        expect(embodiment.restore({itemId: 'live', windowId: 'admitted-window'})).toBe(true);
        expect(source.items[2]).toBe(pane);
        expect(target.items).not.toContain(pane);
        expect(embodiment.isStaged('live')).toBe(false)
    });

    test('promotion leaves the exact placeholder for committed projection cleanup', async () => {
        await embodiment.stage({itemId: 'live', windowId: 'admitted-window'});

        const placeholder = source.items[1];

        expect(embodiment.promote({itemId: 'live', windowId: 'admitted-window'})).toBe(true);
        expect(source.items[1]).toBe(placeholder);
        expect(target.items).toEqual([pane]);
        expect(embodiment.isStaged('live')).toBe(false)
    });

    test('a different or replayed vessel cannot steal an already-staged pane', async () => {
        await expect(embodiment.stage({itemId: 'live', windowId: 'admitted-window'})).resolves.toBe(true);
        expect(embodiment.stage({itemId: 'live', windowId: 'forged-window'})).toBe(false);
        expect(embodiment.restore({itemId: 'live', windowId: 'forged-window'})).toBe(false);
        expect(target.items).toEqual([pane]);
        expect(source.items[1].cls).toContain('neo-dashboard-dock-vessel-placeholder')
    });

    test('target insertion rejection restores the pane and retires the transient record', async () => {
        target.add = () => {
            throw new Error('target insertion rejected')
        };

        await expect(embodiment.stage({itemId: 'live', windowId: 'admitted-window'})).resolves.toBe(false);
        expect(source.items).toHaveLength(3);
        expect(source.items[1]).toBe(pane);
        expect(source.items.some(item => item.cls?.includes('neo-dashboard-dock-vessel-placeholder'))).toBe(false);
        expect(target.items).toEqual([]);
        expect(embodiment.isStaged('live')).toBe(false)
    });

    test('target update rejection restores the pane from the vessel through the live placeholder slot', async () => {
        const targetAdd = target.add.bind(target);

        target.add = item => {
            const result = targetAdd(item);

            target.promiseUpdate = async () => {
                throw new Error('target update rejected')
            };

            return result
        };

        await expect(embodiment.stage({itemId: 'live', windowId: 'admitted-window'})).resolves.toBe(false);
        expect(source.items).toHaveLength(3);
        expect(source.items[1]).toBe(pane);
        expect(source.items.some(item => item.cls?.includes('neo-dashboard-dock-vessel-placeholder'))).toBe(false);
        expect(target.items).toEqual([]);
        expect(embodiment.isStaged('live')).toBe(false)
    })
});
