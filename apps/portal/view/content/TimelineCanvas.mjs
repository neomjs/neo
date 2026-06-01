import SharedCanvas from '../../../../src/app/SharedCanvas.mjs';

/**
 * @summary The "Coordinator" component for the Neural Timeline, bridging the App Worker and Canvas Worker.
 *
 * This component renders a transparent canvas overlay on top of the content list. It is responsible for:
 * 1. **Data Bridge**: Listening to the `sections` store and passing record data to the `TimelineCanvas` (SharedWorker).
 * 2. **Visual Alignment**: Calculating the precise DOM positions of Ticket Avatars/Badges to ensure the
 *    canvas nodes align perfectly with the HTML content.
 * 3. **Lifecycle Management**: initializing the offscreen canvas transfer and handling resize events.
 *
 * It uses the `Portal.canvas.TimelineCanvas` singleton (via Remote Method Access) to drive the actual animation.
 *
 * @class Portal.view.content.TimelineCanvas
 * @extends Neo.app.SharedCanvas
 */
class TimelineCanvas extends SharedCanvas {
    /**
     * @member {Object} delayable
     */
    static delayable = {
        ensureFinalAlignment: {
            type : 'debounce',
            timer: 300
        }
    }

    static config = {
        /**
         * @member {String} className='Portal.view.content.TimelineCanvas'
         * @protected
         */
        className: 'Portal.view.content.TimelineCanvas',
        /**
         * @member {String} rendererClassName='Portal.canvas.TimelineCanvas'
         */
        rendererClassName: 'Portal.canvas.TimelineCanvas',
        /**
         * @member {String} rendererImportPath='apps/portal/canvas/TimelineCanvas.mjs'
         */
        rendererImportPath: 'apps/portal/canvas/TimelineCanvas.mjs',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'div', cls: ['neo-timeline-wrapper'], style: {width: '100%', height: '100%'}, cn: [
            {tag: 'canvas', style: {width: '100%', height: '100%'}}
        ]}
    }

    /**
     * @member {Object[]} lastRecords=null
     */
    lastRecords = null

    /**
     *
     */
    ensureFinalAlignment() {
        let me = this;

        if (me.lastRecords) {
            me.onTimelineDataLoad(me.lastRecords, true)
        }
    }

    /**
     * Lifecycle hook that runs once the `OffscreenCanvas` has been transferred to the Canvas Worker.
     *
     * This method:
     * 1. Imports the `TimelineCanvas` logic into the Canvas Worker context.
     * 2. Initializes the graph in the worker via Remote Method Access (`initGraph`).
     * 3. Sets up a `ResizeObserver` to keep the canvas size synced with the DOM.
     * 4. Triggers the initial data load if store data is available.
     *
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetOffscreenRegistered(value, oldValue) {
        let me = this;

        await super.afterSetOffscreenRegistered(value, oldValue);

        if (value) {
            // Initial load check
            let store = me.getStateProvider().getStore('sections');

            if (store.getCount() > 0) {
                me.onTimelineDataLoad(store.items)
            }
        }
    }

    /**
     * Override to return the inner canvas ID
     */
    getCanvasId() {
        let me = this;

        if (!me.canvasId) {
            me.canvasId = me.vdom.cn[0].id
        }
        return me.canvasId
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me    = this,
            store = me.getStateProvider().getStore('sections');

        store.on('load', me.onTimelineDataLoad, me)
    }

    /**
     * @param {Object} data
     */
    async onResize(data) {
        let me = this;

        // Update the canvas size in the worker
        await me.updateSize(data.contentRect);

        // If we have cached records, re-calculate node positions
        // because the container dimensions (and likely relative positions) have changed.
        if (me.lastRecords) {
            // We don't need to re-fetch rects instantly, but it's safer to do so
            // to ensure alignment with the new layout.
            await me.onTimelineDataLoad(me.lastRecords, true);

            // Debounced check to ensure the canvas is aligned after any transitions settle
            me.ensureFinalAlignment()
        }
    }

    /**
     * @summary Translates avatar/badge DOM rects into canvas-local node descriptors, skipping unmeasured elements.
     *
     * A zero-size rect (`{x:0,y:0,width:0,height:0}`) is returned for any `-target` element that is not
     * laid out at capture time — a content-visibility-collapsed `<details>` body, a lazy avatar image
     * not yet loaded, or an element mid route-transition. Such rects MUST be rejected: translated into
     * canvas-local space (`x = rect.x - canvasRect.x`) a zero rect yields a bogus node at the far-left
     * edge (`x = -canvasRect.x`), which the renderer draws as a spurious spine segment angling off to
     * the left / a second spine converging on the last node.
     *
     * @param {Object[]} records    The timeline records, parallel to `rects`
     * @param {Object[]} rects      The fetched DOMRects for each record's `-target` element
     * @param {Object}   canvasRect The canvas overlay's DOMRect, for screen→canvas-local translation
     * @returns {Object} `{nodes, startY}`
     */
    buildNodes(records, rects, canvasRect) {
        let nodes  = [],
            startY = 0;

        rects.forEach((rect, index) => {
            let record = records[index];

            // Reject zero-size rects — an unmeasured element would translate to a bogus far-left node.
            if (rect && rect.width > 0 && rect.height > 0) {
                // PRECISE CENTERING: `rect` is the actual avatar/badge.
                let offset  = rect.height / 2,
                    nodeY   = rect.y - canvasRect.y + offset,
                    nodeX   = rect.x - canvasRect.x + (rect.width / 2),
                    // Distinct padding for the Orbit effect: avatars (~40px) get more room than badges (~28px)
                    padding = rect.height > 32 ? 6 : 3;

                nodes.push({
                    color : record.color, // Hex color (e.g. #ff0000)
                    id    : record.id,
                    radius: offset + padding,
                    y     : nodeY,
                    x     : nodeX
                });

                // Anchor startY to the first rendered (measurable) node
                if (nodes.length === 1) {
                    startY = nodeY
                }
            }
        });

        return {nodes, startY}
    }

    /**
     * The core "Alignment Engine" of the timeline.
     *
     * This method synchronizes the Canvas nodes with the DOM elements (Avatars/Badges).
     *
     * **Strategy:**
     * 1. **Targeting**: It uses the `-target` ID suffix to find the specific DOM elements (Avatars) within the content list.
     * 2. **Measurement**: It fetches the `DOMRect` for every target to get its exact screen position.
     * 3. **Translation**: It converts these screen coordinates into Canvas-local coordinates.
     * 4. **Handoff**: It packages this geometric data (x, y, radius, color) and sends it to the
     *    `TimelineCanvas` worker to update the physics simulation.
     *
     * @param {Object[]|Object} records Array of records or Store load event object {items: [...]}
     * @param {Boolean} [isResize=false]
     */
    async onTimelineDataLoad(records, isResize = false) {
        let me = this;

        // Handle Store 'load' event signature: fire('load', {items: [...]})
        if (records && !Array.isArray(records) && records.items) {
            records = records.items
        }

        if (!Array.isArray(records)) {
            // Safety check if records is still invalid
            return
        }

        if (!me.isCanvasReady) {
            return
        }

        let reset = !isResize;

        // Smart Check: If it's a store load (reset=true) BUT the ticket ID is the same,
        // it's a data refresh (e.g. comment added), so we should NOT reset the animation.
        if (reset && me.lastRecords && records[0]?.id === me.lastRecords[0]?.id) {
            reset = false
        }

        me.lastRecords = records;

        let ids = records.map(r => `${r.id}-target`),
            rects;

        try {
            // Fetch DOM rects for the MARKERS (Avatars/Badges), not the containers
            rects = await me.waitForDomRect({
                attempts: 20,
                delay   : 50,
                id      : ids
            });

            if (me.lastRecords !== records) {
                return
            }

            // Check if we got valid rects (at least one)
            let hasRects = rects && rects.some(r => r);

            if (!hasRects) {
                return
            }

            // On first valid data load (not resize), ensure size is synced
            // because content might have pushed the container height.
            if (!isResize) {
                await me.updateSize()
            }

            let canvasRect      = await me.getDomRect(me.getCanvasId()),
                {nodes, startY} = me.buildNodes(records, rects, canvasRect);

            await me.renderer.updateGraphData({nodes, reset, startY});

            // Some `-target` rects can be zero-sized at first capture — a content-visibility-collapsed
            // `<details>` body, a lazy avatar image not yet loaded, or a mid-route-transition layout.
            // `buildNodes` skips those (a zero rect would translate to a bogus far-left node),
            // so re-run the alignment once layout settles to pick them up. Mirrors the `onResize` path;
            // guarded on `!isResize` so the `ensureFinalAlignment` re-entry (isResize=true) cannot recurse.
            if (!isResize) {
                me.ensureFinalAlignment()
            }
        } catch (e) {
            console.error('TimelineCanvas update failed', e)
        }
    }
}

export default Neo.setupClass(TimelineCanvas);
