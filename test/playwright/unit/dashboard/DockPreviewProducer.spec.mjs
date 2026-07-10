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

    test('the header-strip carve-out wins inside the band at real scale, and yields on small zones', () => {
        const BIG = {x: 0, y: 0, width: 400, height: 300};   // band = 0.24 * 300 = 72 > carve-out 36
        const k   = (x, y) => producer.resolvePlacementKind(BIG, {x, y});

        // Inside the carve-out (the tab header strip): the most intentional add-as-tab gesture.
        expect(k(200, 20)).toBe('tab-into');
        expect(k(200, 36)).toBe('tab-into');
        // Below the carve-out but inside the band: top-edge semantics survive.
        expect(k(200, 50)).toBe('edge-top');
        // Small zones (carve-out >= band): the landed five-zone grammar is untouched — the
        // existing pins above (edge-top at y=10 on the 100px rect) assert exactly that.
        expect(producer.resolvePlacementKind(RECT, {x: 50, y: 10})).toBe('edge-top')
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

        // y = 38 sits above the header carve-out (36), inside the wide band (40), past the
        // default band (24) — isolating the band-tunability contract from the carve-out.
        expect(producer.resolvePlacementKind(RECT, {x: 50, y: 38})).toBe('tab-into'); // default band 24: 38 > 24
        expect(wide.resolvePlacementKind(RECT, {x: 50, y: 38})).toBe('edge-top');     // wide band 40: 38 < 40

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
    });

    test('the produce → previewToOperation → applyOperation pipeline SPLITS the target for an edge drop', async () => {
        const DockZoneModel = (await import('../../../../src/dashboard/DockZoneModel.mjs')).default;

        // a minimal dockZone.v1 doc: a vertical split of two single-tab zones
        const doc = {
            schema: 'neo.harness.dockZone.v1',
            root  : 'root',
            items : {a: {componentRef: 'A', title: 'A', kind: 'panel'}, b: {componentRef: 'B', title: 'B', kind: 'panel'}},
            nodes : {
                root    : {type: 'split', orientation: 'vertical', children: ['a-tabs', 'b-tabs'], sizes: [0.5, 0.5]},
                'a-tabs': {type: 'tabs', items: ['a'], activeItemId: 'a'},
                'b-tabs': {type: 'tabs', items: ['b'], activeItemId: 'b'}
            }
        };

        // the initial tree has ONE split — the vertical root; no horizontal split yet
        expect(Object.values(doc.nodes).some(n => n.type === 'split' && n.orientation === 'horizontal')).toBe(false);

        // drop item 'a' near the LEFT edge of b-tabs (a vertical-split child) → edge-left → splitNode (perpendicular axis)
        const zones   = [{nodeId: 'b-tabs', rect: RECT, orientation: 'vertical'}];
        const preview = producer.produce({pointer: {x: 8, y: 50}, zones, itemId: 'a'}); // x=8 in a 100px rect (band 24) → edge-left
        expect(preview.placement.kind).toBe('edge-left');

        // the middle: preview → semantic operation descriptor
        const descriptor = DockPreview.previewToOperation(preview);
        expect(descriptor.operation).toBe('splitNode');
        expect(descriptor.targetNodeId).toBe('b-tabs');

        // the reducer applies it — a NEW split node appears (an interior tab-into move would not add one)
        const result = DockZoneModel.applyOperation(doc, descriptor);
        expect(result.errors ?? []).toEqual([]);
        expect(DockZoneModel.validate(result.document)).toEqual([]);                    // the split produced a valid dockZone.v1 tree

        // edge-left → a NEW horizontal split now exists (there were none before) → the pipeline genuinely split the target
        expect(Object.values(result.document.nodes).some(n => n.type === 'split' && n.orientation === 'horizontal'),
            'the edge-left drop created a horizontal split node').toBe(true)
    })
});
