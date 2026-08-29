import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockSplitterLivePreviewTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * The live conserved-pair preview contract — worker tier.
 *
 * The main thread previews the adjacent pair (complementary sizes, constant total, both members'
 * CSS bounds intersected) and reports one CSS-bounded terminal pixel value; this tier pins what the
 * App Worker does with that report: the terminal wins over pointer arithmetic so the committed
 * vector equals the final preview by construction, the pointer-delta fallback still carries the
 * proxy presentation, and a live-preview rejection re-projects the unchanged committed document.
 * (The rendered component tier drives the real pointer against real projected geometry.)
 */
test.describe('Neo.dashboard.dock.interaction.DockSplitter — live pair preview', () => {
    let Container, DockSplitter, container, splitter;

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
        Container    = (await import('../../../../src/container/Base.mjs')).default;
        DockSplitter = (await import('../../../../src/dashboard/dock/interaction/DockSplitter.mjs')).default
    });

    const mount = (splitterConfig = {}) => {
        container = Neo.create(Container, {
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [
                {ntype: 'component', flex: 1, id: 'live-pane-a'},
                {
                    module       : DockSplitter,
                    id           : 'live-splitter',
                    boundaryIndex: 0,
                    orientation  : 'horizontal',
                    splitNodeId  : 'split-1',
                    ...splitterConfig
                },
                {ntype: 'component', flex: 1, id: 'live-pane-b'}
            ]
        });

        splitter = container.items[1];
        splitter.dockNodeType = 'splitter';
        splitter.dragZone = {
            destroy() {}, dragEnd() {}, dragStart() {}, isDestroyed: false,
            async registerZone() {}, set() {}
        };
        container.getLayoutRect = async () => [{width: 600}, {width: 300}, {width: 300}];
        return splitter
    };

    test.afterEach(() => {
        container?.destroy();
        container = splitter = null
    });

    test('the terminal pixel report wins over pointer arithmetic: committed vector equals the final preview', async () => {
        mount({dockZoneDocument: DOC()});

        await splitter.captureDragStart({clientX: 300, clientY: 150});

        // the pointer travelled +199px, but the preview clamped/painted 340px last — 340 must commit
        const result = splitter.onDragEnd({clientX: 499, clientY: 150, resizeSize: 340});

        expect(result.errors).toEqual([]);

        const sizes = splitter.dockZoneDocument.nodes['split-1'].sizes;
        expect(sizes[0]).toBeCloseTo(340 / 600, 5);
        expect(sizes[1]).toBeCloseTo(260 / 600, 5);
        expect(sizes[0] + sizes[1]).toBeCloseTo(1, 5)
    });

    test('without a terminal report the pointer-delta fallback carries the proxy presentation', async () => {
        mount({dockZoneDocument: DOC(), liveResize: false});

        await splitter.captureDragStart({clientX: 300, clientY: 150});

        const result = splitter.onDragEnd({clientX: 400, clientY: 150});

        expect(result.errors).toEqual([]);
        expect(splitter.dockZoneDocument.nodes['split-1'].sizes[0]).toBeCloseTo(400 / 600, 5)
    });

    test('pair terminals settle the main thread: restore on refusal, release on success, silence without a generation', async () => {
        const drive = async (config, terminal) => {
            const settles = [];

            mount({
                dockZoneDocument: DOC(),
                ...config
            });
            splitter.dragZone.settleResize = data => settles.push(data);

            await splitter.captureDragStart({clientX: 300, clientY: 150});
            splitter.onDragEnd({clientX: 400, clientY: 150, ...terminal});

            const calls = settles.slice();
            container.destroy();
            container = splitter = null;
            return calls
        };

        // refusal: the generation-scoped snapshot must be restored — main painted preview pixels
        const rejected = await drive(
            {applyDockZoneOperation: () => ({document: null, errors: ['rejected']})},
            {resizeGeneration: 3, resizeSize: 340, resizeTargetId: 'live-pane-a'}
        );
        expect(rejected).toEqual([{resizeGeneration: 3, resizeTargetId: 'live-pane-a', restore: true}]);

        // success: the snapshot is released, never restored — the preview pixels ARE the outcome
        const adopted = await drive({}, {resizeGeneration: 4, resizeSize: 340, resizeTargetId: 'live-pane-a'});
        expect(adopted).toEqual([{resizeGeneration: 4, resizeTargetId: 'live-pane-a', restore: false}]);

        // a terminal without a settlement generation (proxy presentation) never calls settle
        const proxy = await drive({liveResize: false}, {});
        expect(proxy).toEqual([])
    });

    test('capture measures the same outer layout boxes the descriptor registers: custom roots, transform-immune', async () => {
        mount();

        // custom vdom roots: the public id lives on an inner node; the WRAPPER participates in
        // layout — descriptor and capture must both speak wrapper ids, or preview and commit
        // reason about different boxes
        container.vdom.id        = 'wrap-parent';
        container.items[0].vdom.id = 'wrap-a';
        container.items[2].vdom.id = 'wrap-b';

        const requested = [],
              layout    = {'wrap-parent': {width: 600}, 'wrap-a': {width: 220}, 'wrap-b': {width: 380}};

        // the discriminator: only wrapper ids resolve to layout truth — an inner-id request
        // (the pre-fix basis) would fall through to the zero shape and fail the size asserts
        container.getLayoutRect = async ids => {
            requested.push(...ids);
            return ids.map(id => layout[id] || {width: 0})
        };

        const descriptor = splitter.getResizeConfig(),
              state      = await splitter.captureDragStart({clientX: 300, clientY: 150});

        expect(requested).toEqual(['wrap-parent', 'wrap-a', 'wrap-b']);
        expect([descriptor.parentId, descriptor.targetId, descriptor.counterTargetId])
            .toEqual(['wrap-parent', 'wrap-a', 'wrap-b']);
        expect(state.sizes).toEqual([220, 380]);
        expect(state.parentSize).toBe(600)
    });

    test('opting back into liveResize at runtime re-registers the pair descriptor', async () => {
        mount({liveResize: false});

        const pushed = [];
        splitter.dragZone.set = config => pushed.push(config);

        expect(splitter.getResizeConfig()).toBe(null);

        splitter.liveResize = true;               // afterSet re-drives the zone on its own
        await splitter.refreshDragZone();

        expect(pushed.at(-1).useProxy).toBe(false);
        expect(pushed.at(-1).resizeConfig).toMatchObject({
            counterTargetId: 'live-pane-b',
            preview        : true,
            targetId       : 'live-pane-a'
        })
    });
});
