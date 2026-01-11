import Canvas from '../../../../../src/component/Canvas.mjs';

/**
 * @class AgentOS.view.TimelineCanvas
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
     * Triggered after the offscreenRegistered config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetOffscreenRegistered(value, oldValue) {
        if (value) {
            let me = this;

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

            // Hook into state provider to listen for timeline updates
            let store = me.getStateProvider().getStore('sections');
            store.on('load', me.onTimelineDataLoad, me);

            // Initial load check
            if (store.getCount() > 0) {
                me.onTimelineDataLoad(store.items)
            }
        }
    }

    /**
     * Override to return the inner canvas ID
     */
    getCanvasId() {
        if (!this.canvasId) {
            this.canvasId = this.vdom.cn[0].id
        }
        return this.canvasId;
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
            me.onTimelineDataLoad(me.lastRecords, 0, true)
        }
    }

    /**
     * @param {Object[]} records
     * @param {Number} [attempt=0]
     * @param {Boolean} [isResize=false]
     */
    onTimelineDataLoad(records, attempt=0, isResize=false) {
        let me = this;
        
        if (!me.isCanvasReady) return;

        me.lastRecords = records;

        // If this is a fresh data load (not a resize), wait a bit for DOM
        let delay = isResize ? 50 : 100;

        me.timeout(delay).then(async () => {
            // Target the actual Avatar/Badge elements we added IDs to
            let ids          = records.map(r => `${r.id}-target`),
                componentId  = me.getStateProvider().data.contentComponentId,
                timelineId   = `ticket-timeline-${componentId}`,
                rects, timelineRect;

            try {
                // Fetch DOM rects for the MARKERS (Avatars/Badges), not the containers
                rects = await me.getDomRect(ids);

                // Fetch timeline container rect (optional, fallback)
                if (componentId) {
                    timelineRect = await me.getDomRect(timelineId);
                }

                // Check if we got valid rects (at least one)
                let hasRects = rects && rects.some(r => r);

                // Retry logic:
                // If we miss rects OR if we miss the timeline container (and we expect one), retry.
                if ((!hasRects || !timelineRect) && attempt < 10) {
                    me.onTimelineDataLoad(records, attempt + 1, isResize);
                    return;
                }

                // On first valid data load (not resize), ensure size is synced 
                // because content might have pushed the container height.
                if (!isResize && attempt === 0) {
                    await me.updateSize(); 
                }

                let canvasRect = await me.getDomRect(me.getCanvasId());
                let nodes      = [];
                let startY     = 0;

                ids.forEach((targetId, index) => {
                    let rect   = rects[index],
                        record = records[index];

                    if (rect) {
                        // PRECISE CENTERING
                        // Now 'rect' is the actual avatar/badge.
                        let offset = rect.height / 2;
                        let nodeY  = rect.y - canvasRect.y + offset;
                        let nodeX  = rect.x - canvasRect.x + (rect.width / 2);

                        nodes.push({
                            id: record.id, // Keep original ID for logic
                            y : nodeY,
                            x : nodeX
                        });

                        // Set the startY of the line to the first node
                        if (index === 0) {
                            startY = nodeY;
                        }
                    }
                });

                await Portal.canvas.TicketCanvas.updateGraphData({nodes, startY});

            } catch (e) {
                console.error('TimelineCanvas update failed', e)
            }
        })
    }

    async updateSize(rect) {
        let me = this;

        if (!rect || rect.width === 0 || rect.height === 0) {
            rect = await me.waitForDomRect({id: me.getCanvasId()})
        }

        await Portal.canvas.TicketCanvas.updateSize({width: rect.width, height: rect.height});
    }
}

export default Neo.setupClass(TimelineCanvas);