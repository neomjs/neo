import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockDropIndicatorsTest'
    }
});

import {test, expect}                                          from '@playwright/test';
import Neo                                                     from '../../../../src/Neo.mjs';
import * as core                                               from '../../../../src/core/_export.mjs';
import DockDropIndicators                                      from '../../../../src/dashboard/dock/interaction/DropIndicators.mjs';
import DockPreviewProducer                                     from '../../../../src/dashboard/dock/interaction/PreviewProducer.mjs';
import {CANDIDATES_SCHEMA, PREVIEW_SCHEMA, previewToOperation} from '../../../../src/dashboard/dock/model/PreviewContract.mjs';

// Geometry fixture (viewport space): host at (100, 50); hovered zone centered at (400, 300).
const HOST_RECT = {x: 100, y: 50, width: 800, height: 600};
const ZONE_RECT = {x: 300, y: 250, width: 200, height: 100};
const ROOT_RECT = {x: 100, y: 50, width: 800, height: 600};

const mkPreview = (nodeId, kind, itemId='terminal') => ({
    schema   : PREVIEW_SCHEMA,
    previewId: `preview:${itemId}:${nodeId}:${kind}`,
    itemId,
    source   : {surface: 'dashboard-sort-zone', sortZoneId: 'src-tabs'},
    target   : {containerId: null, nodeId},
    placement: {kind},
    feedback : {state: 'accepted'}
});

const mkSet = ({root=true, zoneRect=ZONE_RECT, nodeId='main-tabs'}={}) => ({
    schema: CANDIDATES_SCHEMA,
    itemId: 'terminal',
    zone  : {nodeId, rect: zoneRect, orientation: null},
    cross : [
        {position: 'center', preview: mkPreview(nodeId, 'tab-into')},
        {position: 'top',    preview: mkPreview(nodeId, 'edge-top')},
        {position: 'right',  preview: mkPreview(nodeId, 'edge-right')},
        {position: 'bottom', preview: mkPreview(nodeId, 'edge-bottom')},
        {position: 'left',   preview: mkPreview(nodeId, 'edge-left')}
    ],
    root: root ? {
        nodeId: 'root',
        rect  : ROOT_RECT,
        chips : [
            {edge: 'top',    preview: mkPreview('root', 'edge-top')},
            {edge: 'right',  preview: mkPreview('root', 'edge-right')},
            {edge: 'bottom', preview: mkPreview('root', 'edge-bottom')},
            {edge: 'left',   preview: mkPreview('root', 'edge-left')}
        ]
    } : null
});

const indicatorChildren = layer => (layer.items || []).filter(item => item.candidateKey);
const childByKey        = (layer, key) => layer.items.find(item => item.candidateKey === key);
const isOff             = child => child.cls.includes('neo-dashboard-dock-drop-indicator-off');

test.describe('Neo.dashboard.dock.interaction.DropIndicators (§06 — the indicator-overlay menu)', () => {
    let layer;

    test.afterEach(() => {
        layer?.destroy();
        layer = null
    });

    test('constructs nine persistent indicator children, everything hidden until a set arrives', () => {
        layer = Neo.create(DockDropIndicators);

        const children = indicatorChildren(layer);

        expect(children).toHaveLength(9);
        expect(children.map(c => c.candidateKey).sort()).toEqual([
            'chip-bottom', 'chip-left', 'chip-right', 'chip-top',
            'cross-bottom', 'cross-center', 'cross-left', 'cross-right', 'cross-top'
        ]);
        expect(children.every(isOff)).toBe(true);
        expect(layer.cls).toContain('neo-dashboard-dock-drop-indicators-hidden');
        expect(layer.hitTest({x: 400, y: 300})).toBeNull()
    });

    test('a valid set positions the cross around the zone center and the chips inside the root edges', () => {
        layer = Neo.create(DockDropIndicators, {hostRect: HOST_RECT});
        layer.candidateSet = mkSet();

        expect(layer.cls).not.toContain('neo-dashboard-dock-drop-indicators-hidden');

        // indicatorSize 32 → half 16; zone center (400, 300); layer-local = viewport − host origin
        const center = childByKey(layer, 'cross-center');
        expect(isOff(center)).toBe(false);
        expect(center.style.left).toBe('284px'); // 400 − 16 − 100
        expect(center.style.top).toBe('234px');  // 300 − 16 − 50
        expect(center.style.width).toBe('32px');

        // step = 32 + 6 = 38: top sits one step above the center
        const top = childByKey(layer, 'cross-top');
        expect(top.style.left).toBe('284px');
        expect(top.style.top).toBe('196px');     // 234 − 38

        // chips: chipSize 26, inset 10 — top chip centers on the root x-midline, inset from its top
        const chipTop = childByKey(layer, 'chip-top');
        expect(isOff(chipTop)).toBe(false);
        expect(chipTop.style.left).toBe('387px'); // (100 + 400 − 13) − 100
        expect(chipTop.style.top).toBe('10px');   // (50 + 10) − 50

        const chipLeft = childByKey(layer, 'chip-left');
        expect(chipLeft.style.left).toBe('10px');
        expect(chipLeft.style.top).toBe('287px')  // (50 + 300 − 13) − 50
    });

    test('object permanence: the same child instances glide to a new zone — never recreated', () => {
        layer = Neo.create(DockDropIndicators, {hostRect: HOST_RECT});
        layer.candidateSet = mkSet();

        const idsBefore    = indicatorChildren(layer).map(c => c.id),
              centerBefore = childByKey(layer, 'cross-center').style.left;

        // the drag crosses into another zone: same instances, new geometry
        layer.candidateSet = mkSet({zoneRect: {x: 500, y: 250, width: 200, height: 100}, nodeId: 'side-tabs'});

        expect(indicatorChildren(layer).map(c => c.id)).toEqual(idsBefore);
        expect(childByKey(layer, 'cross-center').style.left).not.toBe(centerBefore);
        expect(childByKey(layer, 'cross-center').style.left).toBe('484px') // 600 − 16 − 100
    });

    test('hitTest resolves indicators in viewport space, topmost (chips) first on overlap', () => {
        layer = Neo.create(DockDropIndicators, {hostRect: HOST_RECT});
        layer.candidateSet = mkSet();

        expect(layer.hitTest({x: 400, y: 300}).position).toBe('center');
        expect(layer.hitTest({x: 400, y: 262}).position).toBe('top');   // 246..278 band
        expect(layer.hitTest({x: 10, y: 10})).toBeNull();
        expect(layer.hitTest(null)).toBeNull();

        // overlap: park the zone so its top cross indicator lands on the root's top chip row —
        // the chip renders above the cross, so the chip must win the tie
        layer.candidateSet = mkSet({zoneRect: {x: 400, y: 73, width: 200, height: 100}});

        const hit = layer.hitTest({x: 500, y: 70});
        expect(hit.edge).toBe('top')
    });

    test('getCandidateHitPoint finds a reachable cross point when a higher chip covers its center', () => {
        layer = Neo.create(DockDropIndicators, {hostRect: HOST_RECT});
        layer.candidateSet = mkSet({zoneRect: {x: 400, y: 539, width: 200, height: 100}});

        const previewId = 'preview:terminal:main-tabs:edge-bottom';

        // The root-bottom chip owns the exact center by render-order precedence.
        expect(layer.hitTest({x: 500, y: 627}).preview.previewId)
            .toBe('preview:terminal:root:edge-bottom');

        const point = layer.getCandidateHitPoint(previewId);

        expect(point).not.toBeNull();
        expect(layer.hitTest(point).preview.previewId).toBe(previewId);
        expect(layer.getCandidateHitPoint('missing-preview')).toBeNull()
    });

    test('updatePointer drives the active candidate: event fired, active cls tracked', () => {
        layer = Neo.create(DockDropIndicators, {hostRect: HOST_RECT});
        layer.candidateSet = mkSet();

        const events = [];
        layer.on('dropIndicatorActiveChange', data => events.push(data.candidate?.preview.previewId ?? null));

        const hit = layer.updatePointer({x: 400, y: 300});

        expect(hit.position).toBe('center');
        expect(layer.activeCandidate.preview.previewId).toBe('preview:terminal:main-tabs:tab-into');
        expect(childByKey(layer, 'cross-center').cls).toContain('neo-dashboard-dock-drop-indicator-active');
        expect(events).toEqual(['preview:terminal:main-tabs:tab-into']);

        // pointer leaves every indicator: selection clears, cls drops, event fires with null
        expect(layer.updatePointer({x: 10, y: 10})).toBeNull();
        expect(layer.activeCandidate).toBeNull();
        expect(childByKey(layer, 'cross-center').cls).not.toContain('neo-dashboard-dock-drop-indicator-active');
        expect(events).toEqual(['preview:terminal:main-tabs:tab-into', null])
    });

    test('the active selection survives a set swap only when its previewId survives', () => {
        layer = Neo.create(DockDropIndicators, {hostRect: HOST_RECT});
        layer.candidateSet = mkSet();
        layer.updatePointer({x: 400, y: 300}); // center on main-tabs

        // same zone re-measured (same previewIds): the selection holds
        layer.candidateSet = mkSet({zoneRect: {x: 310, y: 250, width: 200, height: 100}});
        expect(layer.activeCandidate?.preview.previewId).toBe('preview:terminal:main-tabs:tab-into');

        // different zone (new previewIds): the stale selection clears
        layer.candidateSet = mkSet({nodeId: 'side-tabs'});
        expect(layer.activeCandidate).toBeNull()
    });

    test('clear() is the drag-terminal path: hidden layer, no selection, empty hit-test', () => {
        layer = Neo.create(DockDropIndicators, {hostRect: HOST_RECT});
        layer.candidateSet = mkSet();
        layer.updatePointer({x: 400, y: 300});

        layer.clear();

        expect(layer.candidateSet).toBeNull();
        expect(layer.activeCandidate).toBeNull();
        expect(layer.cls).toContain('neo-dashboard-dock-drop-indicators-hidden');
        expect(layer.hitTest({x: 400, y: 300})).toBeNull();
        expect(indicatorChildren(layer).every(isOff)).toBe(true)
    });

    test('fail-closed: a malformed set or a missing host rect hides the layer', () => {
        layer = Neo.create(DockDropIndicators, {hostRect: HOST_RECT});

        layer.candidateSet = {...mkSet(), schema: 'nope.v0'};
        expect(layer.cls).toContain('neo-dashboard-dock-drop-indicators-hidden');

        layer.candidateSet = mkSet({root: false});                       // root:null is VALID — cross-only menu
        expect(layer.cls).not.toContain('neo-dashboard-dock-drop-indicators-hidden');
        expect(indicatorChildren(layer).filter(c => !isOff(c))).toHaveLength(5);
        expect(layer.hitTest({x: 487, y: 73})).toBeNull();               // no chips to hit

        layer.hostRect = null;                                           // host vanished: hide, never guess
        expect(layer.cls).toContain('neo-dashboard-dock-drop-indicators-hidden')
    });

    test('producer handshake: a real produceCandidates payload renders, hits, and converts', () => {
        const producer = Neo.create(DockPreviewProducer);

        const zones = [{nodeId: 'b-tabs', rect: {x: 300, y: 250, width: 200, height: 100}, orientation: 'vertical'}];
        const set   = producer.produceCandidates({
            pointer: {x: 400, y: 300}, zones, itemId: 'a',
            root   : {nodeId: 'root', rect: ROOT_RECT}
        });

        layer = Neo.create(DockDropIndicators, {hostRect: HOST_RECT});
        layer.candidateSet = set;

        // hovering the BOTTOM indicator selects the along-axis sibling insert…
        const hit = layer.updatePointer({x: 400, y: 338}); // center (400,300) + step 38
        expect(hit.preview.placement.kind).toBe('split-after');

        // …and the carried preview converts through the UNCHANGED contract path — the
        // component stayed commit-free; the descriptor is the workspace's business
        const descriptor = previewToOperation(hit.preview);
        expect(descriptor.operation).toBe('splitNode');
        expect(descriptor.targetNodeId).toBe('b-tabs');
        expect(descriptor.orientation).toBe('vertical');

        producer.destroy()
    })
});
