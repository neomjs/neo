import Component from '../component/Base.mjs';

/**
 * # The "Dual-Pipeline" Scrolling Architecture
 * 
 * We do not use native vertical scrollbars on the `neo-grid-view` itself for several absolutely
 * critical architectural reasons required to maintain 60 FPS performance in the Multi-Body Grid.
 * 
 * 1. The Optical Overlay (Z-Order): If we relied strictly on native container scrollbars, the scrollbar
 *    would appear inside the right-most column segment. By utilizing an absolutely positioned dummy scrollbar
 *    at the container level, we ensure the scrollbar consistently overlays all locked and scrolling body segments,
 *    giving mobile and desktop users guaranteed thumb grab access seamlessly on the far right edge without 
 *    column boundary conflicts.
 * 
 * 2. Asynchronous Wheel/Trackpad Gliding: The `neo-grid-view` strictly utilizes `overflow-y: scroll`. This 
 *    is intentional. It allows wheel and trackpad scroll events to be fully hardware-accelerated by the browser's 
 *    GPU compositor, producing zero-lag buttery smooth scrolling. The ScrollManager simply records the delta and 
 *    syncs the dummy scrollbar passively.
 * 
 * 3. The Thread-Blocking Thumb-Drag Paradox: When a user grabs a native scrollbar thumb and drags it at
 *    high velocity, the DOM immediately scrolls the container *before* the App Worker can calculate, serialize,
 *    and ship new VDOM rows. This results in horrific "blank body" artifacting where the DOM outpaces the JS engine.
 * 
 * To solve #3, this `VerticalScrollbar` component acts as a physical proxy. When a user drags THIS scrollbar's target,
 * the `GridRowScrollPinning` main-thread add-on intercepts the interaction. Instead of the browser natively scrolling 
 * the grid view, the add-on applies Main-Thread synchronous `translate3d` transforms (hardware-accelerated GPU pinning)
 * to forcefully lock the grid bodies into optical alignment with the delayed VDOM deltas.
 * 
 * This effectively prevents the chromium scrolling compositor from dropping row nodes due to VDOM backpressure,
 * completely eliminating rendering jitter during brutal manual thumb interactions.
 * 
 * CRITICAL DIRECTIVE: This component is fundamental to the framework's baseline physics engine. 
 * DO NOT ATTEMPT to merge this scrollbar back into localized native `overflow-y` styling, or you will categorically 
 * resurrect high-velocity JS-driven scroll tearing.
 * 
 * @class Neo.grid.VerticalScrollbar
 * @extends Neo.component.Base
 */
class VerticalScrollbar extends Component {
    static config = {
        /**
         * @member {String} className='Neo.grid.VerticalScrollbar'
         * @protected
         */
        className: 'Neo.grid.VerticalScrollbar',
        /**
         * @member {String} ntype='grid-vertical-scrollbar'
         * @protected
         */
        ntype: 'grid-vertical-scrollbar',
        /**
         * @member {String[]} baseCls=['neo-grid-vertical-scrollbar']
         * @protected
         */
        baseCls: ['neo-grid-vertical-scrollbar'],
        /**
         * Number in px
         * @member {Number} rowHeight_=0
         * @reactive
         */
        rowHeight_: 0,
        /**
         * @member {Neo.data.Store|null} store_=null
         * @reactive
         */
        store_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {cls: ['neo-grid-scrollbar-content']}
        ]}
    }

    /**
     * @param {Boolean} mounted
     * @protected
     */
    async addScrollSync(mounted) {
        let me         = this,
            {windowId} = me,
            ScrollSync = await Neo.currentWorker.getAddon('ScrollSync', windowId),
            params     = {id: me.id, windowId};

        if (mounted) {
            ScrollSync.register({
                fromId: me.parent.view.id,
                toId  : me.id,
                twoWay: true,
                ...params
            })
        } else {
            ScrollSync.unregister(params)
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        oldValue !== undefined && this.addScrollSync(value)
    }

    /**
     * Triggered after the rowHeight config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRowHeight(value, oldValue) {
        value > 0 && this.updateScrollHeight()
    }

    /**
     * Triggered after the store config got changed
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        if (value) {
            let me = this;

            value.on({
                filter: me.updateScrollHeight,
                load  : me.updateScrollHeight,
                scope : me
            })
        }
    }

    /**
     * @param {Object}   data
     * @param {Object[]} data.items
     * @param {Number}   [data.total]
     * @protected
     */
    updateScrollHeight(data) {
        let me           = this,
            countRecords = data?.total ? data.total : me.store.count,
            {rowHeight}  = me;

        if (countRecords > 0 && rowHeight > 0) {
            me.vdom.cn[0].height = `${(countRecords + 1) * rowHeight}px`;
            me.update()
        }
    }
}

export default Neo.setupClass(VerticalScrollbar);
