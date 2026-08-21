import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSFleetCockpitDockDocumentTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

test.describe('AgentOS.view.fleet cockpit dock document — dockZone.v1 default layout', () => {
    let DockZoneModel, cockpitDockDocument;

    test.beforeAll(async () => {
        DockZoneModel       = (await import('../../../../../src/dashboard/DockZoneModel.mjs')).default;
        cockpitDockDocument = (await import('../../../../../apps/agentos/view/fleet/cockpitDockDocument.mjs')).default
    });

    test('validates against DockZoneModel with the v1 schema (zero invariant violations)', () => {
        const doc = cockpitDockDocument();

        expect(doc.schema).toBe('neo.harness.dockZone.v1');
        expect(DockZoneModel.validate(doc)).toEqual([])
    });

    test('expresses the SSOT ~1.55fr / 1fr fleet-over-activity vertical split (activity docks to the bottom)', () => {
        const split = cockpitDockDocument().nodes['primary-split'];

        expect(split.type).toBe('split');
        expect(split.orientation).toBe('vertical');

        const [fleetSize, streamSize] = split.sizes;
        expect(fleetSize + streamSize).toBeCloseTo(1, 6);   // normalized
        expect(fleetSize / streamSize).toBeCloseTo(1.55, 1) // ~1.55 : 1
    });

    test('declares the inspector + tool chrome autoHidden (the #14617 rail input); primaries and reading surfaces are not', () => {
        const {items} = cockpitDockDocument();

        const autoHidden = Object.entries(items).filter(([, i]) => i.autoHidden === true).map(([id]) => id);
        expect(autoHidden.sort()).toEqual(['defineAgent', 'detail', 'perspectives', 'wakeRoutes']);

        expect(items.fleet.autoHidden).toBeUndefined();
        expect(items.stream.autoHidden).toBeUndefined();

        // reading surfaces are resident south tabs, never rail-collapsed
        expect(items.memories.autoHidden).toBeUndefined();
        expect(items.operator.autoHidden).toBeUndefined();
        expect(items.catchUp.autoHidden).toBeUndefined()
    });

    test('carries the S5 define-agent zone: rail-resident, invoked-not-ambient tool chrome (the design ruling)', () => {
        const doc = cockpitDockDocument();

        expect(doc.items.defineAgent).toEqual({
            componentRef: 'define-agent',
            title       : 'Add agent',
            kind        : 'tool',
            autoHidden  : true
        });

        // rail membership: the zone collapses to the same secondary rail as the other invoked chrome —
        // and it must NOT sit in either primary zone (ambient placement is what the ruling rejected)
        expect(doc.nodes['secondary-rail'].items).toContain('defineAgent');
        expect(doc.nodes['fleet-tabs'].items).not.toContain('defineAgent');
        expect(doc.nodes['stream-tabs'].items).not.toContain('defineAgent')
    });

    test('carries the south reading-surface family: resident tabs beside Activity, Activity active', () => {
        const doc = cockpitDockDocument();

        expect(doc.items.memories).toEqual({componentRef: 'memories',         title: 'Memories', kind: 'panel'});
        expect(doc.items.operator).toEqual({componentRef: 'operator-mailbox', title: 'Mailbox',  kind: 'panel'});
        expect(doc.items.catchUp).toEqual({componentRef: 'catch-up',          title: 'Catch up', kind: 'panel'});

        expect(doc.nodes['stream-tabs'].items).toEqual(['stream', 'memories', 'operator', 'catchUp']);
        expect(doc.nodes['stream-tabs'].activeItemId).toBe('stream');

        // the rail is inspector + invoked tools only — reading surfaces never squeeze onto it
        expect(doc.nodes['secondary-rail'].items).toEqual(['detail', 'perspectives', 'defineAgent', 'wakeRoutes']);
        expect(doc.nodes['fleet-tabs'].items).toEqual(['fleet'])
    });

    test('is pure data — a fresh, equal document each call (no shared mutable singleton)', () => {
        const a = cockpitDockDocument(),
              b = cockpitDockDocument();

        expect(a).not.toBe(b);   // fresh instance
        expect(a).toEqual(b)     // deterministic content
    });

    test('the pane inventory covers the two primary zones and every tabs item resolves to a record', () => {
        const doc = cockpitDockDocument();

        expect(doc.items.fleet.componentRef).toBe('fleet-grid');
        expect(doc.items.stream.componentRef).toBe('activity-stream');

        const tabItems = Object.values(doc.nodes).filter(n => n.type === 'tabs').flatMap(n => n.items);
        tabItems.forEach(id => expect(doc.items[id]).toBeDefined())
    })
});
