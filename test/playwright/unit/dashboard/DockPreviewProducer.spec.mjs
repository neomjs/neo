import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockPreviewProducerTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

test.describe('Neo.dashboard.dock.interaction.PreviewProducer (ADR 0029 §2.3 — the dock preview producer)', () => {
    let DockPreviewProducer, DockPreview, producer;

    const RECT = {x: 0, y: 0, width: 100, height: 100}; // default band = 0.24 * 100 = 24

    test.beforeAll(async () => {
        DockPreviewProducer = (await import('../../../../src/dashboard/dock/interaction/PreviewProducer.mjs')).default;
        DockPreview         = (await import('../../../../src/dashboard/dock/interaction/Preview.mjs')).default;
        producer            = Neo.create(DockPreviewProducer)
    });

    test.afterAll(() => {
        producer?.destroy()
    });

    test('resolvePlacementKind maps the zones deterministically — the top edge is strip-owned', () => {
        const k = (x, y) => producer.resolvePlacementKind(RECT, {x, y});

        expect(k(50, 50)).toBe('tab-into');
        // The top region belongs to the header-strip carve-out (36 > band 24 on this rect):
        // dropping on a tabs zone's upper area IS the add-as-tab gesture — never a top split.
        expect(k(50, 10)).toBe('tab-into');
        expect(k(5,  5 )).toBe('tab-into');
        expect(k(50, 23.9)).toBe('tab-into');
        expect(k(50, 24.1)).toBe('tab-into');
        // The other three edges keep the five-zone grammar.
        expect(k(50, 90)).toBe('edge-bottom');
        expect(k(10, 50)).toBe('edge-left');
        expect(k(90, 50)).toBe('edge-right');
        expect(k(5,  95)).toBe('edge-bottom')  // corner tie resolves bottom > left (deterministic order)
    });

    test('the header-strip carve-out wins at REAL projected strip geometry (the #14913 journey scale)', () => {
        // The live adapter projects tabs-zone rects strip-shallow — this is the observed
        // rendered scale of the demo's Terminal zone. Band = 0.24 * 44 = 10.56; the effective
        // carve-out caps at height/2 = 22, and it must NOT deactivate here: this exact rect is
        // where the fits-inside-the-band precondition classified the primary journey as a split.
        const STRIP = {x: 0, y: 0, width: 402, height: 44};
        const k     = (x, y) => producer.resolvePlacementKind(STRIP, {x, y});

        expect(k(200, 5 )).toBe('tab-into');   // inside the old 10.56px band → was edge-top, the shipped bug
        expect(k(200, 15)).toBe('tab-into');   // mid-strip
        expect(k(200, 22)).toBe('tab-into');   // carve-out cap boundary (height/2)
        expect(k(200, 30)).toBe('tab-into');   // bottom half, interior (dBottom 14 > band)
        expect(k(200, 40)).toBe('edge-bottom') // bottom edge band survives on ANY zone
    });

    test('the carve-out on tall zones: full 36px depth, strip-owned under EVERY orientation', () => {
        const BIG = {x: 0, y: 0, width: 400, height: 300};   // band = 0.24 * 300 = 72; carve-out caps at 36
        const k   = (x, y, o) => producer.resolvePlacementKind(BIG, {x, y}, o);

        // Inside the carve-out (the tab header strip): the most intentional add-as-tab gesture —
        // the strip row outranks edge-top AND the along-axis split-before (the live journey's
        // terminal zone is a vertical-split child; a strip-top drop must never sibling-insert).
        expect(k(200, 20)).toBe('tab-into');
        expect(k(200, 36)).toBe('tab-into');
        expect(k(200, 20, 'vertical')).toBe('tab-into');
        expect(k(200, 20, 'horizontal')).toBe('tab-into');
        // Below the carve-out but inside the band: top-edge semantics survive on tall zones,
        // including the along-axis mapping.
        expect(k(200, 50)).toBe('edge-top');
        expect(k(200, 50, 'vertical')).toBe('split-before')
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
        expect(h(50, 8 )).toBe('tab-into');     // perpendicular top edge is strip-owned (carve-out)
        expect(h(50, 92)).toBe('edge-bottom');
        expect(h(50, 50)).toBe('tab-into');

        // vertical split: children stacked → the bottom edge is a sibling insertion; left/right
        // split the node. The TOP edge is strip-owned on this rect (carve-out ≥ band) — the
        // leading sibling-insert is only reachable below the carve-out on tall zones (pinned in
        // the tall-zone spec above).
        const v = (x, y) => producer.resolvePlacementKind(RECT, {x, y}, 'vertical');
        expect(v(50, 8 )).toBe('tab-into');     // strip-owned top
        expect(v(50, 92)).toBe('split-after');  // trailing (bottom)
        expect(v(8,  50)).toBe('edge-left');    // perpendicular edge stays a node split
        expect(v(92, 50)).toBe('edge-right')
    });

    test('produce carries placement.orientation for split-* and passes the consumer validator', () => {
        // The bottom edge carries the sibling-insert on vertical-split children (the top is
        // strip-owned by the carve-out — see the placement-grammar specs).
        const zones   = [{nodeId: 'side-split-child', rect: RECT, orientation: 'vertical'}];
        const preview = producer.produce({pointer: {x: 50, y: 92}, zones, itemId: 'terminal'});

        expect(preview.placement.kind).toBe('split-after');
        expect(preview.placement.orientation).toBe('vertical');  // contract: split placements MUST carry orientation
        expect(preview.previewId).toBe('preview:terminal:side-split-child:split-after');
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
        // A tall rect (band 72 > carve-out 36) keeps every kind reachable incl. edge-top —
        // on strip-scale rects the carve-out owns the top by design (see the STRIP spec).
        const zones = [{nodeId: 'main-tabs', rect: {x: 0, y: 0, width: 400, height: 300}}];

        // one produce per resolvable kind — each MUST satisfy the landed DockPreview.isValidPreview (write === read)
        for (const [x, y, kind] of [[200, 150, 'tab-into'], [200, 50, 'edge-top'], [390, 150, 'edge-right'], [10, 150, 'edge-left'], [200, 290, 'edge-bottom']]) {
            const preview = producer.produce({pointer: {x, y}, zones, itemId: 'strategy', containerId: 'workspace'});

            expect(preview.schema).toBe('neo.dock.preview.v1');
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

    test('whole-stack production carries one coherent runtime group through previews and candidates', async () => {
        const {isValidCandidateSet} = await import('../../../../src/dashboard/dock/model/PreviewContract.mjs');
        const zones                 = [{nodeId: 'main-tabs', rect: RECT, orientation: 'vertical'}];
        const params                = {
            groupNodeId: 'popup-stack',
            itemId     : 'strategy',
            pointer    : {x: 50, y: 50},
            zones
        };
        const preview = producer.produce(params);
        const set     = producer.produceCandidates(params);

        expect(preview.groupNodeId).toBe('popup-stack');
        expect(preview.previewId).toBe('preview:group:popup-stack:main-tabs:tab-into');
        expect(DockPreview.isValidPreview(preview)).toBe(true);
        expect(set.groupNodeId).toBe('popup-stack');
        expect(set.cross.every(candidate => candidate.preview.groupNodeId === 'popup-stack')).toBe(true);
        expect(isValidCandidateSet(set)).toBe(true);

        expect(producer.produce({...params, groupNodeId: ''})).toBeNull();
        expect(producer.produceCandidates({...params, groupNodeId: 42})).toBeNull()
    });

    test('the produce → previewToOperation → applyOperation pipeline SPLITS the target for an edge drop', async () => {
        const Operations = (await import('../../../../src/dashboard/dock/model/Operations.mjs')).default,
              Document   = (await import('../../../../src/dashboard/dock/model/Document.mjs')).default;

        // a minimal dockZone.v1 doc: a vertical split of two single-tab zones
        const doc = {
            schema: 'neo.dock.zone.v1',
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
        const result = Operations.applyOperation(doc, descriptor);
        expect(result.errors ?? []).toEqual([]);
        expect(Document.validate(result.document)).toEqual([]);                    // the split produced a valid dockZone.v1 tree

        // edge-left → a NEW horizontal split now exists (there were none before) → the pipeline genuinely split the target
        expect(Object.values(result.document.nodes).some(n => n.type === 'split' && n.orientation === 'horizontal'),
            'the edge-left drop created a horizontal split node').toBe(true)
    });

    test('produceCandidates emits the full §06 menu — schema-pinned, every preview consumer-valid', async () => {
        const contract = await import('../../../../src/dashboard/dock/model/PreviewContract.mjs');

        const TALL  = {x: 100, y: 100, width: 400, height: 300};
        const ROOT  = {x: 0, y: 0, width: 800, height: 600};
        const zones = [{nodeId: 'main-tabs', rect: TALL, orientation: 'vertical'}];

        const set = producer.produceCandidates({
            pointer: {x: 300, y: 250}, zones, itemId: 'terminal',
            root   : {nodeId: 'root', rect: ROOT}
        });

        // the schema config is pinned against the contract module (same mechanism as `schema`)
        expect(set.schema).toBe(contract.CANDIDATES_SCHEMA);
        expect(contract.isValidCandidateSet(set)).toBe(true);      // THE candidate-set PIN

        // the 5-position cross, §06 grammar on a vertical-split child: along-axis directions
        // sibling-insert, perpendicular directions split the node, center tab-merges
        const kinds = Object.fromEntries(set.cross.map(c => [c.position, c.preview.placement.kind]));

        expect(kinds).toEqual({
            center: 'tab-into',
            top   : 'split-before',
            bottom: 'split-after',
            left  : 'edge-left',
            right : 'edge-right'
        });

        // container chips: 4, ALWAYS edge-* (the root is nobody's split child), targeting the root
        expect(set.root.nodeId).toBe('root');
        expect(set.root.chips.map(c => c.preview.placement.kind)).toEqual(['edge-top', 'edge-right', 'edge-bottom', 'edge-left']);
        expect(set.root.chips.every(c => c.preview.target.nodeId === 'root')).toBe(true);

        // EVERY candidate preview individually passes the app-layer consumer validator
        for (const candidate of [...set.cross, ...set.root.chips]) {
            expect(DockPreview.isValidPreview(candidate.preview)).toBe(true)
        }
    });

    test('produceCandidates grammar parity: an indicator candidate IS the pointer-inferred preview', () => {
        // Same placement, two tiers: the candidate for direction `bottom` on a vertical-split
        // child must equal the preview pointer inference emits inside the bottom band —
        // field-for-field, previewId included. One assembly path, zero drift.
        const TALL  = {x: 0, y: 0, width: 400, height: 300};
        const zones = [{nodeId: 'side', rect: TALL, orientation: 'vertical'}];

        const set       = producer.produceCandidates({pointer: {x: 200, y: 150}, zones, itemId: 'terminal'});
        const candidate = set.cross.find(c => c.position === 'bottom').preview;
        const inferred  = producer.produce({pointer: {x: 200, y: 290}, zones, itemId: 'terminal'});

        expect(candidate).toEqual(inferred)
    });

    test('produceCandidates chips: omitted without a root, and when the hovered zone IS the root', () => {
        const RECT_ = {x: 0, y: 0, width: 400, height: 300};
        const zones = [{nodeId: 'only-tabs', rect: RECT_}];
        const at    = {pointer: {x: 200, y: 150}, zones, itemId: 'a'};

        expect(producer.produceCandidates(at).root).toBeNull();                                            // no root supplied
        expect(producer.produceCandidates({...at, root: {nodeId: 'only-tabs', rect: RECT_}}).root).toBeNull(); // hovered IS root
        expect(producer.produceCandidates({...at, root: {nodeId: 'root', rect: RECT_}}).root).not.toBeNull()  // distinct root
    });

    test('produceCandidates is fail-closed like every producer path', () => {
        const zones = [{nodeId: 'main-tabs', rect: RECT}];

        expect(producer.produceCandidates({pointer: {x: 500, y: 500}, zones, itemId: 'a'})).toBeNull(); // over no zone
        expect(producer.produceCandidates({pointer: {x: 50, y: 50}, zones, itemId: ''})).toBeNull();    // no item id
        expect(producer.produceCandidates()).toBeNull()                                                  // no args
    });

    test('isValidCandidateSet rejects partial, duplicated, mismatched and lying menus', async () => {
        const {isValidCandidateSet} = await import('../../../../src/dashboard/dock/model/PreviewContract.mjs');

        const TALL  = {x: 0, y: 0, width: 400, height: 300};
        const valid = (orientation='vertical') => producer.produceCandidates({
            pointer: {x: 200, y: 150}, zones: [{nodeId: 'main-tabs', orientation, rect: TALL}], itemId: 'terminal',
            root   : {nodeId: 'root', rect: {x: 0, y: 0, width: 800, height: 600}}
        });

        // Both producer grammar axes are positive controls: the stricter tuple gate must preserve
        // every real emission while rejecting only contradictory direction/orientation payloads.
        expect(isValidCandidateSet(valid('vertical'))).toBe(true);
        expect(isValidCandidateSet(valid('horizontal'))).toBe(true);

        // a one-entry "menu" is a partial menu — rejected (completeness, not just per-entry validity)
        let set = valid();
        set.cross = [set.cross[0]];
        expect(isValidCandidateSet(set)).toBe(false);

        // duplicated positions are rejected even at the right length
        set = valid();
        set.cross[1] = {...set.cross[0]};
        expect(isValidCandidateSet(set)).toBe(false);

        // a candidate whose position lies about its operation is rejected
        // (the review falsifier: a `center` indicator wired to an `edge-left` split)
        set = valid();
        set.cross.find(c => c.position === 'center').preview.placement = {kind: 'edge-left'};
        expect(isValidCandidateSet(set)).toBe(false);

        // a candidate built for ANOTHER item is rejected
        set = valid();
        set.cross[2].preview.itemId = 'somebody-else';
        expect(isValidCandidateSet(set)).toBe(false);

        // a cross candidate targeting a node other than the hovered zone is rejected
        set = valid();
        set.cross[3].preview.target.nodeId = 'other-node';
        expect(isValidCandidateSet(set)).toBe(false);

        // chips: a missing edge is rejected (4 unique required when root exists)…
        set = valid();
        set.root.chips.pop();
        expect(isValidCandidateSet(set)).toBe(false);

        // …and a chip whose kind does not match its own edge is rejected
        set = valid();
        set.root.chips.find(c => c.edge === 'top').preview.placement = {kind: 'edge-bottom'};
        expect(isValidCandidateSet(set)).toBe(false);

        // a split-kind on a TRAILING direction claiming `split-before` is rejected
        set = valid();
        set.cross.find(c => c.position === 'bottom').preview.placement = {kind: 'split-before', orientation: 'vertical'};
        expect(isValidCandidateSet(set)).toBe(false);

        // Split direction + kind + axis form one semantic tuple. Each otherwise-valid split kind
        // is rejected when it advertises the perpendicular axis.
        for (const [position, kind, orientation] of [
            ['top',    'split-before', 'horizontal'],
            ['bottom', 'split-after',  'horizontal'],
            ['left',   'split-before', 'vertical'],
            ['right',  'split-after',  'vertical']
        ]) {
            set = valid(position === 'left' || position === 'right' ? 'horizontal' : 'vertical');
            set.cross.find(candidate => candidate.position === position).preview.placement = {kind, orientation};
            expect(isValidCandidateSet(set), `${position} ${kind} must reject ${orientation}`).toBe(false)
        }
    })
});
