import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockPreviewProducerTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

test.describe('Neo.dashboard.DockPreviewProducer (ADR 0029 §2.3 — the dock preview producer)', () => {
    let DockPreviewProducer, DockPreview, producer;

    const RECT = {x: 0, y: 0, width: 100, height: 100}; // default band = 0.24 * 100 = 24

    test.beforeAll(async () => {
        DockPreviewProducer = (await import('../../../../src/dashboard/DockPreviewProducer.mjs')).default;
        DockPreview         = (await import('../../../../apps/agentos/view/DockPreview.mjs')).default;
        producer            = Neo.create(DockPreviewProducer)
    });

    test.afterAll(() => {
        producer?.destroy()
    });

    test('resolvePlacementKind maps the five zones deterministically', () => {
        const k = (x, y) => producer.resolvePlacementKind(RECT, {x, y});

        expect(k(50, 50)).toBe('tab-into');
        expect(k(50, 10)).toBe('edge-top');
        expect(k(50, 90)).toBe('edge-bottom');
        expect(k(10, 50)).toBe('edge-left');
        expect(k(90, 50)).toBe('edge-right');
        expect(k(5,  5 )).toBe('edge-top');    // corner tie resolves top > left (deterministic order)
        expect(k(50, 23.9)).toBe('edge-top');  // just inside the edge band
        expect(k(50, 24.1)).toBe('tab-into')   // just past the edge band
    });

    test('resolvePlacementKind is fail-closed for outside / malformed input', () => {
        expect(producer.resolvePlacementKind(RECT, {x: 150, y: 50})).toBe('rejected');       // outside x
        expect(producer.resolvePlacementKind(RECT, {x: 50,  y: -1})).toBe('rejected');       // outside y
        expect(producer.resolvePlacementKind(null, {x: 5, y: 5})).toBe('rejected');          // no rect
        expect(producer.resolvePlacementKind({x: 0, y: 0, width: 0, height: 100}, {x: 0, y: 5})).toBe('rejected'); // zero width
        expect(producer.resolvePlacementKind(RECT, {x: 'a', y: 5})).toBe('rejected')         // non-numeric
    });

    test('edgeBandRatio is a config, not a static field — a wider band re-zones the same pointer', () => {
        // the extensibility payoff: an app / subclass tunes the affordance thickness via config
        const wide = Neo.create(DockPreviewProducer, {edgeBandRatio: 0.4}); // band = 40 on a 100px rect

        expect(producer.resolvePlacementKind(RECT, {x: 50, y: 30})).toBe('tab-into'); // default band 24: 30 > 24
        expect(wide.resolvePlacementKind(RECT, {x: 50, y: 30})).toBe('edge-top');     // wide band 40: 30 < 40

        wide.destroy()
    });

    test('resolvePlacementKind resolves split-before/after along the parent-split axis', () => {
        // horizontal split: children side-by-side → left/right edges are sibling insertions; top/bottom split the node
        const h = (x, y) => producer.resolvePlacementKind(RECT, {x, y}, 'horizontal');
        expect(h(8,  50)).toBe('split-before'); // leading (left)
        expect(h(92, 50)).toBe('split-after');  // trailing (right)
        expect(h(50, 8 )).toBe('edge-top');     // perpendicular edge stays a node split
        expect(h(50, 92)).toBe('edge-bottom');
        expect(h(50, 50)).toBe('tab-into');

        // vertical split: children stacked → top/bottom are sibling insertions; left/right split the node
        const v = (x, y) => producer.resolvePlacementKind(RECT, {x, y}, 'vertical');
        expect(v(50, 8 )).toBe('split-before'); // leading (top)
        expect(v(50, 92)).toBe('split-after');  // trailing (bottom)
        expect(v(8,  50)).toBe('edge-left');    // perpendicular edge stays a node split
        expect(v(92, 50)).toBe('edge-right')
    });

    test('produce carries placement.orientation for split-* and passes the consumer validator', () => {
        const zones   = [{nodeId: 'side-split-child', rect: RECT, orientation: 'vertical'}];
        const preview = producer.produce({pointer: {x: 50, y: 8}, zones, itemId: 'terminal'});

        expect(preview.placement.kind).toBe('split-before');
        expect(preview.placement.orientation).toBe('vertical');  // contract: split placements MUST carry orientation
        expect(preview.previewId).toBe('preview:terminal:side-split-child:split-before');
        expect(DockPreview.isValidPreview(preview)).toBe(true)   // THE PIN — incl. the split-orientation requirement
    });

    test('hitTestZone returns the innermost containing zone, or null', () => {
        const zones = [
            {nodeId: 'root',      rect: {x: 0,  y: 0,  width: 200, height: 200}},
            {nodeId: 'main-tabs', rect: {x: 50, y: 50, width: 100, height: 100}}
        ];

        expect(producer.hitTestZone(zones, {x: 100, y: 100}).nodeId).toBe('main-tabs'); // inner wins
        expect(producer.hitTestZone(zones, {x: 10,  y: 10 }).nodeId).toBe('root');       // only outer contains
        expect(producer.hitTestZone(zones, {x: 500, y: 500})).toBeNull();                // over none
        expect(producer.hitTestZone([{rect: RECT}], {x: 5, y: 5})).toBeNull();           // no nodeId → skipped
        expect(producer.hitTestZone(null, {x: 1, y: 1})).toBeNull()
    });

    test('produce emits a dockPreview.v1 that PASSES the consumer validator (producer→consumer pin)', () => {
        const zones = [{nodeId: 'main-tabs', rect: RECT}];

        // one produce per resolvable kind — each MUST satisfy the landed DockPreview.isValidPreview (write === read)
        for (const [x, y, kind] of [[50, 50, 'tab-into'], [50, 8, 'edge-top'], [92, 50, 'edge-right'], [8, 50, 'edge-left'], [50, 92, 'edge-bottom']]) {
            const preview = producer.produce({pointer: {x, y}, zones, itemId: 'strategy', containerId: 'workspace'});

            expect(preview.schema).toBe('neo.harness.dockPreview.v1');
            expect(preview.placement.kind).toBe(kind);
            expect(preview.target.nodeId).toBe('main-tabs');
            expect(preview.feedback.state).toBe('accepted');
            expect(DockPreview.isValidPreview(preview)).toBe(true) // THE PIN
        }
    });

    test('produce is deterministic and fail-closed', () => {
        const zones = [{nodeId: 'main-tabs', rect: RECT}];

        const a = producer.produce({pointer: {x: 50, y: 50}, zones, itemId: 'strategy'});
        const b = producer.produce({pointer: {x: 50, y: 50}, zones, itemId: 'strategy'});

        expect(a.previewId).toBe(b.previewId);                              // stable id — no time / random source
        expect(a.previewId).toBe('preview:strategy:main-tabs:tab-into');

        expect(producer.produce({pointer: {x: 50,  y: 50 }, zones, itemId: ''})).toBeNull();        // no item id
        expect(producer.produce({pointer: {x: 500, y: 500}, zones, itemId: 'strategy'})).toBeNull(); // over no zone
        expect(producer.produce()).toBeNull()                                                        // no args
    })
});
