import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalContentTimelineCanvasTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import TimelineCanvas from '../../../../../../../apps/portal/view/content/TimelineCanvas.mjs';

/**
 * `Portal.view.content.TimelineCanvas#buildNodes` translates avatar/badge `-target` DOM rects into
 * canvas-local node descriptors. A zero-size rect (`{x:0,y:0,width:0,height:0}`) is returned for any
 * `-target` element not laid out at capture time — a content-visibility-collapsed `<details>` body, a
 * lazy avatar image not yet loaded, or an element mid route-transition. Those MUST be rejected:
 * translated to canvas-local space (`x = rect.x - canvasRect.x`) a zero rect yields a bogus node at the
 * far-left edge (`x = -canvasRect.x`), which the renderer draws as a spurious spine segment angling off
 * to the left / a second spine converging on the last node.
 *
 * Tests the real method directly (no stub) on a prototype instance, since `buildNodes` is pure over its
 * arguments and holds no instance state.
 */
test.describe("Portal.view.content.TimelineCanvas — buildNodes zero-rect rejection (#12322)", () => {
    const canvasRect = {x: 408, y: -100, width: 689, height: 8706};

    const records = [
        {id: 'timeline-1-0', color: '#ff0000'},
        {id: 'timeline-1-1', color: '#00ff00'},
        {id: 'timeline-1-2', color: '#0000ff'}
    ];

    const coordinator = Object.create(TimelineCanvas.prototype);

    test('rejects zero-size rects and keeps measurable nodes correctly placed', () => {
        // rect[1] is a zero rect — an off-screen / collapsed / not-yet-loaded -target element.
        const rects = [
            {x: 466, y: 200, width: 40, height: 40},
            {x: 0,   y: 0,   width: 0,  height: 0},
            {x: 466, y: 500, width: 40, height: 40}
        ];

        const {nodes, startY} = coordinator.buildNodes(records, rects, canvasRect);

        // The zero rect is dropped — only the 2 measurable nodes survive.
        expect(nodes.length).toBe(2);
        expect(nodes.map(n => n.id)).toEqual(['timeline-1-0', 'timeline-1-2']);

        // Canvas-local translation: x = rect.x - canvasRect.x + width/2 = 466 - 408 + 20 = 78.
        expect(nodes[0].x).toBe(78);
        expect(nodes[1].x).toBe(78);

        // y = rect.y - canvasRect.y + height/2 ; canvasRect.y = -100 → 200 + 100 + 20 = 320 / 500 + 100 + 20 = 620.
        expect(nodes[0].y).toBe(320);
        expect(nodes[1].y).toBe(620);
        expect(startY).toBe(320);

        // Bug signature negative-check: NO far-left node at x = -canvasRect.x (-408) — i.e. no x < 0.
        expect(nodes.some(node => node.x < 0)).toBe(false)
    });

    test('startY anchors to the first MEASURABLE node when the leading rect is zero', () => {
        const rects = [
            {x: 0,   y: 0,   width: 0,  height: 0}, // leading item unmeasured
            {x: 466, y: 500, width: 40, height: 40}
        ];

        const {nodes, startY} = coordinator.buildNodes(records.slice(0, 2), rects, canvasRect);

        expect(nodes.length).toBe(1);
        expect(nodes[0].id).toBe('timeline-1-1');
        // startY must be the surviving node's y (620), NOT 0 carried from the dropped leading rect.
        expect(startY).toBe(620)
    });

    test('returns no nodes when every rect is zero (empty spine, never a far-left one)', () => {
        const rects = [
            {x: 0, y: 0, width: 0, height: 0},
            {x: 0, y: 0, width: 0, height: 0}
        ];

        const {nodes, startY} = coordinator.buildNodes(records.slice(0, 2), rects, canvasRect);

        expect(nodes.length).toBe(0);
        expect(startY).toBe(0)
    });

    test('preserves record color and computes orbit radius per marker height', () => {
        const rects = [
            {x: 466, y: 200, width: 40, height: 40}, // avatar (~40px) → padding 6 → radius 26
            {x: 470, y: 500, width: 28, height: 28}  // badge  (~28px) → padding 3 → radius 17
        ];

        const {nodes} = coordinator.buildNodes(records.slice(0, 2), rects, canvasRect);

        expect(nodes[0].color).toBe('#ff0000');
        expect(nodes[0].radius).toBe(26); // 40/2 + 6
        expect(nodes[1].radius).toBe(17)  // 28/2 + 3
    })
});
