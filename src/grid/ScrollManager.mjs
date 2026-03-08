import Base        from '../core/Base.mjs';
import Performance from '../util/Performance.mjs';

/**
 * @class Neo.grid.ScrollManager
 * @extends Neo.core.Base
 */
class ScrollManager extends Base {
    /**
     * @member {Object} delayable
     * @protected
     * @static
     */
    static delayable = {
        onBodyScrollEnd: {type: 'buffer',   timer: 150},
        syncGridBody   : {type: 'throttle', timer:  16}
    }

    static config = {
        /**
         * @member {String} className='Neo.grid.ScrollManager'
         * @protected
         */
        className: 'Neo.grid.ScrollManager',
        /**
         * @member {Boolean} dragScroll_=true
         * @reactive
         */
        dragScroll_: true,
        /**
         * @member {Boolean} mounted_=false
         * @protected
         * @reactive
         */
        mounted_: false,
        /**
         * Uses Neo.main.addon.GridRowScrollPinning
         * @member {Boolean} rowScrollPinning_=true
         * @reactive
         */
        rowScrollPinning_: true,
        /**
         * @member {Number} scrollLeft_=0
         * @protected
         * @reactive
         */
        scrollLeft_: 0,
        /**
         * @member {Number} scrollTop_=0
         * @protected
         * @reactive
         */
        scrollTop_: 0
    }

    /**
     * @member {Neo.grid.Body|null} gridBody=null
     * @protected
     */
    gridBody = null
    /**
     * @member {Neo.grid.Container|null} gridContainer=null
     * @protected
     */
    gridContainer = null

    /**
     * @member {Number} lastScrollTime=0
     * @protected
     */
    lastScrollTime = 0

    /**
     * @member {Number} lastScrollTop=0
     * @protected
     */
    lastScrollTop = 0

    /**
     * @member {Number} scrollAcceleration=0 (px/ms^2)
     * @protected
     */
    scrollAcceleration = 0

    /**
     * @member {Number} scrollVelocity=0 (px/ms)
     * @protected
     */
    scrollVelocity = 0

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetDragScroll(value, oldValue) {
        let cls = 'neo-mouse-drag-scroll';

        if (value) {
            this.gridBody.addCls(cls)
        } else if (oldValue) {
            this.gridBody.removeCls(cls)
        }

        if (this.mounted) {
            this.updateDragScrollAddon(value)
        }
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetMounted(value, oldValue) {
        if (value) {
            this.dragScroll && this.updateDragScrollAddon(true)
        } else if (oldValue) {
            this.updateDragScrollAddon(false)
        }
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetRowScrollPinning(value, oldValue) {
        if (oldValue !== undefined) {
            this.updateRowScrollPinningAddon(value)
        }
    }

    /**
     * @param args
     */
    destroy(...args) {
        this.updateRowScrollPinningAddon(false);
        super.destroy(...args)
    }

    /**
     * Only triggers for vertical scrolling
     * @param {Object} data
     * @protected
     */
    onBodyScroll({scrollTop}) {
        let me  = this,
            now = performance.now();

        if (me.lastScrollTime > 0) {
            let dt = now - me.lastScrollTime;
            // dt < 100 ensures we don't calculate insane velocities from old, stale scrolls
            if (dt > 0 && dt < 100) {
                let newVelocity = (scrollTop - me.lastScrollTop) / dt;

                if (me.scrollVelocity !== 0) {
                    me.scrollAcceleration = (newVelocity - me.scrollVelocity) / dt;
                }

                me.scrollVelocity = newVelocity;
            }
        }

        me.lastScrollTime = now;
        me.lastScrollTop  = scrollTop;

        me.scrollTop            = scrollTop;
        me.gridBody.isScrolling = true;

        me.onBodyScrollEnd();
        me.syncGridBody()
    }

    /**
     * @protected
     */
    onBodyScrollEnd() {
        let me = this;
        
        me.gridBody.isScrolling = false;
        me.lastScrollTime       = 0;
        me.scrollAcceleration   = 0;
        me.scrollVelocity       = 0;
        
        me.syncGridBody()
    }

    /**
     * @param {Object} data
     * @param {Number} data.scrollLeft
     * @param {Object} data.target
     */
    onContainerScroll({scrollLeft, target}) {
        let me = this;

        // We must ignore events for grid-scrollbar
        if (target.id.includes('grid-container')) {
            me.scrollLeft          = scrollLeft;
            me.gridBody.isScrolling = true;

            me.onBodyScrollEnd();
            me.syncGridBody()
        }
    }

    /**
     * @protected
     */
    syncGridBody() {
        let me   = this,
            body = me.gridBody;

        let rtt      = Performance.getAverage('grid.scroll:' + body.id) || 16,
            gen      = Performance.getAverage('grid.createViewData:' + body.id) || 0,
            totalLag = rtt + gen,
            predictedScrollTop = me.scrollTop;

        // Kinematic equation: d = v*t + 0.5*a*t^2
        // Only predict on definitive drags, not single wheel clicks
        if (Math.abs(me.scrollVelocity) > 0.5) {
            // We cap totalLag to 64ms (max ~4 frames) to prevent insane predictions if a thread hangs
            let boundedLag = Math.min(totalLag, 64),
                distance   = (me.scrollVelocity * boundedLag) + (0.5 * me.scrollAcceleration * boundedLag * boundedLag);
            
            predictedScrollTop = Math.max(0, me.scrollTop + distance);
        }

        body.skipCreateViewData = true;

        body.set({
            scrollLeft: me.scrollLeft,
            scrollTop : predictedScrollTop
        });

        body.skipCreateViewData = false;
        body.createViewData();

        me.gridContainer.headerToolbar.scrollLeft = me.scrollLeft
    }

    /**
     * @param {Boolean} active
     * @returns {Promise<void>}
     */
    async updateDragScrollAddon(active) {
        let me    = this,
            addon = await Neo.currentWorker.getAddon('GridDragScroll', me.windowId);

        if (active) {
            addon.register({
                bodyId     : me.gridBody.id + '__wrapper',
                containerId: me.gridContainer.id,
                id         : me.id
            })
        } else {
            addon.unregister({id: me.id})
        }
    }

    /**
     * @param {Boolean} active
     * @returns {Promise<void>}
     */
    async updateRowScrollPinningAddon(active) {
        let me    = this,
            addon = await Neo.currentWorker.getAddon('GridRowScrollPinning', me.windowId);

        if (active) {
            addon.register({
                bodyId: me.gridBody.id,
                id    : me.id
            })
        } else {
            addon.unregister({id: me.id})
        }
    }

    /**
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            scrollLeft: this.scrollLeft,
            scrollTop : this.scrollTop
        }
    }
}

export default Neo.setupClass(ScrollManager);
