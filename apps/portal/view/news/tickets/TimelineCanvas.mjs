import Canvas from '../../../../../src/component/Canvas.mjs';

/**
 * @summary The "Coordinator" component for the Neural Timeline, bridging the App Worker and Canvas Worker.
 *
 * This component renders a transparent canvas overlay on top of the Ticket List. It is responsible for:
 * 1. **Data Bridge**: Listening to the `sections` store and passing ticket data to the `TicketCanvas` (SharedWorker).
 * 2. **Visual Alignment**: Calculating the precise DOM positions of Ticket Avatars/Badges to ensure the
 *    canvas nodes align perfectly with the HTML content.
 * 3. **Lifecycle Management**: initializing the offscreen canvas transfer and handling resize events.
 *
 * It uses the `Portal.canvas.TicketCanvas` singleton (via Remote Method Access) to drive the actual animation.
 *
 * @class Portal.view.news.tickets.TimelineCanvas
 * @extends Neo.component.Canvas
 */
class TimelineCanvas extends Canvas {
    static config = {
        /**
         * @member {String} className='Portal.view.news.tickets.TimelineCanvas'
         * @protected
         */
        className: 'Portal.view.news.tickets.TimelineCanvas',
        /**
         * @member {Object} listeners
         */
        listeners: {
            resize: 'onResize'
        },
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'div', cls: ['neo-ticket-timeline-wrapper'], style: {width: '100%', height: '100%'}, cn: [
            {tag: 'canvas', style: {width: '100%', height: '100%'}}
        ]}
    }

    /**
     * @member {String} canvasId=null
     */
    canvasId = null
    /**
     * @member {Boolean} isCanvasReady=false
     */
    isCanvasReady = false
    /**
     * @member {Object[]} lastRecords=null
     */
    lastRecords = null

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
     * Lifecycle hook that runs once the `OffscreenCanvas` has been transferred to the Canvas Worker.
     *
     * This method:
     * 1. Imports the `TicketCanvas` logic into the Canvas Worker context.
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

        if (value) {
            // Ensure the logic is loaded in the worker
            await Portal.canvas.Helper.importTicketCanvas();

            // Direct Remote Method Access call
            await Portal.canvas.TicketCanvas.initGraph({canvasId: me.getCanvasId(), windowId: me.windowId});

            me.isCanvasReady = true;

            // Register ResizeObserver for the canvas wrapper (me.id)
            Neo.main.addon.ResizeObserver.register({
                id      : me.id,
                windowId: me.windowId
            });

            // Initial sizing
            await me.updateSize();

            // Initial load check
            let store = me.getStateProvider().getStore('sections');

            if (store.getCount() > 0) {
                me.onTimelineDataLoad(store.items)
            }
        } else if (oldValue) {
            me.isCanvasReady = false;
            // Stop the worker loop to prevent "Zombie Canvas" CPU usage
            await Portal.canvas.TicketCanvas.clearGraph()
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
            me.onTimelineDataLoad(me.lastRecords, true)
        }
    }

    /**
     * The core "Alignment Engine" of the timeline.
     *
     * This method synchronizes the Canvas nodes with the DOM elements (Avatars/Badges).
     *
     * **Strategy:**
     * 1. **Targeting**: It uses the `-target` ID suffix to find the specific DOM elements (Avatars) within the ticket list.
     * 2. **Measurement**: It fetches the `DOMRect` for every target to get its exact screen position.
     * 3. **Translation**: It converts these screen coordinates into Canvas-local coordinates.
     * 4. **Handoff**: It packages this geometric data (x, y, radius, color) and sends it to the
     *    `TicketCanvas` worker to update the physics simulation.
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

        me.lastRecords = records;

        let ids         = records.map(r => `${r.id}-target`),
            componentId = me.getStateProvider().getData('contentComponentId'),
            timelineId  = `ticket-timeline-${componentId}`,
            rects, timelineRect;

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

            // Fetch timeline container rect (optional, fallback)
            if (componentId) {
                timelineRect = await me.getDomRect(timelineId)
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

            let canvasRect = await me.getDomRect(me.getCanvasId()),
                nodes      = [],
                startY     = 0;

            ids.forEach((targetId, index) => {
                let rect   = rects[index],
                    record = records[index];

                if (rect) {
                    // PRECISE CENTERING
                    // Now 'rect' is the actual avatar/badge.
                    let offset = rect.height / 2,
                        nodeY  = rect.y - canvasRect.y + offset,
                        nodeX  = rect.x - canvasRect.x + (rect.width / 2),
                        // Distinct padding for Orbit effect
                        // Avatars (~40px) get more breathing room than Badges (~28px)
                        padding = rect.height > 32 ? 6 : 3;

                    nodes.push({
                        color : record.color, // Pass Hex Color (e.g. #ff0000)
                        id    : record.id,
                        radius: offset + padding,
                        y     : nodeY,
                        x     : nodeX
                    });

                    // Set the startY of the line to the first node
                    if (index === 0) {
                        startY = nodeY
                    }
                }
            });

            await Portal.canvas.TicketCanvas.updateGraphData({nodes, reset: !isResize, startY})
        } catch (e) {
            console.error('TimelineCanvas update failed', e)
        }
    }

    /**
     *
     * @param rect
     * @returns {Promise<void>}
     */
    async updateSize(rect) {
        let me = this;

        if (!rect || rect.width === 0 || rect.height === 0) {
            rect = await me.waitForDomRect({id: me.getCanvasId()})
        }

        await Portal.canvas.TicketCanvas.updateSize({width: rect.width, height: rect.height})
    }
}

export default Neo.setupClass(TimelineCanvas);
