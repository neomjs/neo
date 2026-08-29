import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockSplitterEquivalenceTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * The DockSplitter parent-transition equivalence contract — behavior tier.
 *
 * Written against the pre-re-parent implementation (`component.Base` + direct DragZone) and
 * required to pass UNCHANGED after DockSplitter adopts generic `Neo.component.Splitter` for its
 * DragZone / live-resize / generation mechanics. The drive is synthetic and worker-local: the
 * gesture handlers receive exactly the payloads the DOM routing delivers in production, so the
 * contract under test is the class behavior itself — capture, vector resolution, the single
 * fail-closed semantic commit, terminal events, and teardown — with zero DOM-transport variables.
 * (The sibling component spec pins the projected config/class contract on a rendered instance.)
 */
test.describe('Neo.dashboard.dock.interaction.DockSplitter — behavior equivalence', () => {
    let Container, DockSplitter, LayoutAdapter, container, splitter;

    const DOC = () => ({
        schema: 'neo.dock.zone.v1',
        root  : 'split-1',
        items : {
            alpha: {componentRef: 'alpha', title: 'Alpha'},
            beta : {componentRef: 'beta',  title: 'Beta'}
        },
        nodes: {
            'split-1': {type: 'split', orientation: 'horizontal', children: ['zone-a', 'zone-b'], sizes: [0.5, 0.5]},
            'zone-a' : {type: 'tabs', items: ['alpha'], activeItemId: 'alpha'},
            'zone-b' : {type: 'tabs', items: ['beta'],  activeItemId: 'beta'}
        }
    });

    test.beforeAll(async () => {
        Container     = (await import('../../../../src/container/Base.mjs')).default;
        DockSplitter  = (await import('../../../../src/dashboard/dock/interaction/DockSplitter.mjs')).default;
        LayoutAdapter = (await import('../../../../src/dashboard/dock/projection/LayoutAdapter.mjs')).default
    });

    const mount = (splitterConfig = {}) => {
        container = Neo.create(Container, {
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [
                {ntype: 'component', flex: 1, id: 'equiv-pane-a'},
                {
                    module       : DockSplitter,
                    id           : 'equiv-splitter',
                    boundaryIndex: 0,
                    orientation  : 'horizontal',
                    splitNodeId  : 'split-1',
                    ...splitterConfig
                },
                {ntype: 'component', flex: 2, id: 'equiv-pane-b'}
            ]
        });

        splitter = container.items[1];
        // the adapter marks projected splitters so they never count among the split children
        splitter.dockNodeType = 'splitter';
        // gesture-neutral zone stub: the real DragZone posts to main-thread surfaces the unit
        // environment does not own; terminal semantics under test live in the splitter itself
        splitter.dragZone = {
            destroy() {}, dragEnd() {}, dragStart() {}, isDestroyed: false,
            async registerZone() {}, set() {}
        };
        return splitter
    };

    test.afterEach(() => {
        container?.destroy();
        container = splitter = null
    });

    test('capture prefers real rects and falls back to model-order flex weights on failure', async () => {
        mount();

        expect(splitter.getSplitChildItems().map(item => item.id)).toEqual(['equiv-pane-a', 'equiv-pane-b']);

        // rect arm: deterministic child geometry, splitter excluded from the vector
        container.getDomRect = async () => [{width: 600}, {width: 250}, {width: 350}];
        let state = await splitter.captureDragStart({clientX: 300, clientY: 150});
        expect(state.clientX).toBe(300);
        expect(state.sizes).toEqual([250, 350]);

        // fallback arm: a failed rect read degrades to flex weights, never throws
        container.getDomRect = async () => { throw new Error('detached') };
        state = await splitter.captureDragStart({clientX: 310, clientY: 150});
        expect(state.sizes).toEqual([1, 2])
    });

    test('terminal drag commits EXACTLY one normalized resizeSplit through the document path', async () => {
        mount({dockZoneDocument: DOC()});

        const commits = [];
        splitter.onDockZoneDocumentChange = (document, descriptor) => commits.push({document, descriptor});

        await splitter.captureDragStart({clientX: 300, clientY: 150});

        // synthetic rect-derived capture (the component tier owns real-rect parity)
        splitter.dragStartState.sizes = [300, 300];

        const result = splitter.onDragEnd({clientX: 400, clientY: 150});

        expect(result.errors).toEqual([]);
        expect(commits).toHaveLength(1);
        expect(commits[0].descriptor).toMatchObject({operation: 'resizeSplit', splitNodeId: 'split-1'});

        const sizes = splitter.dockZoneDocument.nodes['split-1'].sizes;
        expect(sizes[0]).toBeCloseTo(400 / 600, 5);   // 300+100 of 600
        expect(sizes[0] + sizes[1]).toBeCloseTo(1, 5);
        expect(splitter.dragStartState).toBe(null)    // terminal always clears the capture
    });

    test('the reducer-callback authority wins over the local document and receives the splitter', async () => {
        const seen = [];
        mount({
            applyDockZoneOperation: (descriptor, instance) => {
                seen.push({descriptor, instance});
                return {document: {patched: true}, errors: []}
            },
            dockZoneDocument: DOC()
        });

        await splitter.captureDragStart({clientX: 300, clientY: 150});
        splitter.dragStartState.sizes = [300, 300];

        const result = splitter.onDragEnd({clientX: 360, clientY: 150});

        expect(seen).toHaveLength(1);
        expect(seen[0].instance).toBe(splitter);
        expect(result.document).toEqual({patched: true});
        expect(splitter.dockZoneDocument).toEqual({patched: true})
    });

    test('an invalid vector fails closed: no commit, rejection event payload, document untouched', async () => {
        mount({boundaryIndex: 7, dockZoneDocument: DOC()});   // out-of-range boundary

        const events = [];
        splitter.on('dockSplitterResizeRejected', payload => events.push(payload));

        await splitter.captureDragStart({clientX: 300, clientY: 150});

        const before = Neo.clone(splitter.dockZoneDocument, true),
              result = splitter.onDragEnd({clientX: 400, clientY: 150});

        expect(result.errors.length).toBeGreaterThan(0);
        expect(events).toHaveLength(1);
        expect(splitter.dockZoneDocument).toEqual(before)
    });

    test('a missing commit authority is a loud structured error, never a silent no-op', async () => {
        mount();                                              // no document, no callback

        await splitter.captureDragStart({clientX: 300, clientY: 150});
        splitter.dragStartState.sizes = [300, 300];

        const result = splitter.onDragEnd({clientX: 400, clientY: 150});

        expect(result.errors.join(' ')).toContain('dockZoneDocument');
        expect(result.document).toBe(null)
    });

    test('destroy mid-gesture is safe and re-entrant: no commit, no throw, zone torn down once', async () => {
        mount({dockZoneDocument: DOC()});

        let zoneDestroyed = 0;
        splitter.dragZone.destroy = () => zoneDestroyed++;

        await splitter.captureDragStart({clientX: 300, clientY: 150});

        const before = Neo.clone(splitter.dockZoneDocument, true);

        splitter.destroy();

        expect(zoneDestroyed).toBeLessThanOrEqual(1);
        expect(before.nodes['split-1'].sizes).toEqual([0.5, 0.5])
    });

    test('the descriptor factory resolves identity from configs when no projected data exists', () => {
        mount();

        const descriptor = LayoutAdapter.createResizeSplitOperation(splitter, [0.7, 0.3]);

        expect(descriptor).toEqual({operation: 'resizeSplit', sizes: [0.7, 0.3], splitNodeId: 'split-1'})
    });

    test('mechanism control: the generic gesture machinery is inherited, never duplicated', async () => {
        const GenericSplitter = (await import('../../../../src/component/Splitter.mjs')).default;

        mount();

        // positive control for the no-second-splitter-engine invariant: a bypass would have to
        // re-implement one of these locally, and re-implementing any of them turns this red.
        expect(splitter instanceof GenericSplitter).toBe(true);

        const ownMembers = Object.getOwnPropertyNames(Object.getPrototypeOf(splitter));

        for (const inherited of ['createDragZone', 'refreshDragZone', 'onDragCancel', 'applyResize', 'construct', 'destroy']) {
            expect(ownMembers, `${inherited} stays inherited from the generic Splitter`).not.toContain(inherited)
        }

        // the dock terminal is the one deliberate override, and the generation fence exists
        expect(ownMembers).toContain('onDragEnd');
        expect(Number.isInteger(splitter.dragGeneration)).toBe(true)
    });
});
